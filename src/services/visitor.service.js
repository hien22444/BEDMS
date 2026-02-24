const { VisitorRequest, Visitor, VisitorCheckin, User, Student, Notification } = require("../models");

// Vietnamese phone: 10 digits starting with 0 (covers mobile 03/05/07/08/09 and landlines 02x)
const PHONE_REGEX = /^0\d{9}$/;
// Citizen ID: exactly 12 digits (new CCCD format)
const CCCD_REGEX = /^\d{12}$/;
// Time string HH:MM (00:00–23:59)
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
// Allowed visit window boundaries
const VISIT_WINDOW_START = "07:00";
const VISIT_WINDOW_END   = "17:00";

/** Compare two "HH:MM" strings: negative/0/positive */
const cmpTime = (a, b) => {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return ah * 60 + am - (bh * 60 + bm);
};

/**
 * Generate unique request code: VR-YYYYMMDD-XXXX
 * Uses retry loop to handle race conditions (concurrent requests)
 */
const generateRequestCode = async (maxRetries = 3) => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const prefix = `VR-${dateStr}-`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const lastRequest = await VisitorRequest.findOne({
      request_code: { $regex: `^${prefix}` },
    }).sort({ request_code: -1 });

    let seq = 1;
    if (lastRequest) {
      const lastSeq = parseInt(lastRequest.request_code.split("-").pop(), 10);
      seq = lastSeq + 1;
    }

    const code = `${prefix}${String(seq).padStart(4, "0")}`;

    // Check if code already exists (race condition guard)
    const exists = await VisitorRequest.findOne({ request_code: code });
    if (!exists) return code;

    // Code already taken, retry with incremented seq
  }

  // Fallback: append random suffix to guarantee uniqueness
  const fallbackSeq = Date.now().toString().slice(-6);
  return `${prefix}${fallbackSeq}`;
};

/**
 * Create a visitor request with visitors (atomic with rollback)
 * @param {string} userId - The authenticated user's ID
 * @param {Object} body - { visit_date, visit_time_from, visit_time_to, purpose, visitors: [...] }
 */
const createVisitorRequest = async (userId, body) => {
  const { visit_date, purpose, visitors, visit_time_from, visit_time_to } = body;

  // H4: Verify the caller is an active student
  const user = await User.findById(userId);
  if (!user || !user.is_active) {
    throw new Error("Your account is inactive. Please contact the dormitory management office.");
  }
  const student = await Student.findOne({ user: userId });
  if (!student) {
    throw new Error("Only registered students can create visitor requests.");
  }

  // H2: Enforce ban status before allowing any further processing
  if (student.is_banned_permanently) {
    throw new Error("Your account has been permanently banned from making visitor requests.");
  }
  if (student.ban_until_semester) {
    throw new Error(`You are banned from making requests until the end of semester ${student.ban_until_semester}.`);
  }

  if (!visit_date || !purpose) {
    throw new Error("visit_date and purpose are required");
  }

  // Validate visit_date is not in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const visitDate = new Date(visit_date);
  visitDate.setHours(0, 0, 0, 0);
  if (visitDate < today) {
    throw new Error("visit_date cannot be in the past");
  }

  if (!visitors || !Array.isArray(visitors) || visitors.length === 0) {
    throw new Error("At least one visitor is required");
  }

  if (visitors.length > 5) {
    throw new Error("Maximum 5 visitors per request");
  }

  // Validate visit time window
  const timeFrom = visit_time_from || VISIT_WINDOW_START;
  const timeTo   = visit_time_to   || VISIT_WINDOW_END;

  if (!TIME_REGEX.test(timeFrom) || !TIME_REGEX.test(timeTo)) {
    throw new Error("visit_time_from and visit_time_to must be in HH:MM format (e.g. 08:00)");
  }
  if (cmpTime(timeFrom, VISIT_WINDOW_START) < 0) {
    throw new Error(`Visit time cannot start before ${VISIT_WINDOW_START}`);
  }
  if (cmpTime(timeTo, VISIT_WINDOW_END) > 0) {
    throw new Error(`Visit time cannot end after ${VISIT_WINDOW_END}`);
  }
  if (cmpTime(timeFrom, timeTo) >= 0) {
    throw new Error("visit_time_from must be earlier than visit_time_to");
  }

  // Validate each visitor
  for (const v of visitors) {
    if (!v.full_name || !v.citizen_id || !v.phone || !v.relationship) {
      throw new Error(
        "Each visitor must have full_name, citizen_id, phone, and relationship"
      );
    }
    if (!PHONE_REGEX.test(v.phone)) {
      throw new Error(
        `Invalid phone number for "${v.full_name}": must be a 10-digit Vietnamese mobile number (e.g. 0901234567)`
      );
    }
    if (!CCCD_REGEX.test(v.citizen_id)) {
      throw new Error(
        `Invalid citizen ID for "${v.full_name}": must be exactly 12 digits`
      );
    }
    if (v.relationship === "other" && !v.relationship_other) {
      throw new Error(
        `Please specify the relationship for visitor "${v.full_name}" (relationship_other is required when relationship is "other")`
      );
    }
  }

  const request_code = await generateRequestCode();

  const request = await VisitorRequest.create({
    request_code,
    user: userId,
    visit_date,
    visit_time_from: timeFrom,
    visit_time_to: timeTo,
    purpose,
  });

  // Create visitor records — rollback request if this fails
  let visitorDocs;
  try {
    visitorDocs = await Visitor.insertMany(
      visitors.map((v) => ({
        request: request._id,
        full_name: v.full_name,
        citizen_id: v.citizen_id,
        phone: v.phone,
        relationship: v.relationship,
        relationship_other: v.relationship_other || null,
      }))
    );
  } catch (err) {
    // Rollback: delete the orphaned request
    await VisitorRequest.findByIdAndDelete(request._id);
    throw new Error("Failed to create visitors. Request has been rolled back.");
  }

  return {
    ...request.toJSON(),
    visitors: visitorDocs,
  };
};

/**
 * Get visitor requests for the authenticated student
 */
const getMyVisitorRequests = async (userId) => {
  const requests = await VisitorRequest.find({ user: userId })
    .sort({ createdAt: -1 })
    .lean();

  // Attach visitors + checkin records to each request
  const requestIds = requests.map((r) => r._id);
  const visitors = await Visitor.find({
    request: { $in: requestIds },
  }).lean();
  const checkins = await VisitorCheckin.find({
    request: { $in: requestIds },
  }).lean();

  return requests.map((r) => ({
    ...r,
    id: r._id,
    visitors: visitors
      .filter((v) => v.request.toString() === r._id.toString())
      .map((v) => ({
        ...v,
        id: v._id,
        checkin:
          checkins.find((c) => c.visitor.toString() === v._id.toString()) ||
          null,
      })),
  }));
};

/**
 * Cancel a pending visitor request (student only)
 */
const cancelVisitorRequest = async (requestId, userId) => {
  const request = await VisitorRequest.findById(requestId);
  if (!request) throw new Error("Request not found");
  if (request.user.toString() !== userId.toString()) {
    throw new Error("You can only cancel your own requests");
  }
  if (request.status !== "pending") {
    throw new Error("Only pending requests can be cancelled");
  }

  request.status = "cancelled";
  await request.save();
  return request;
};

/**
 * Get all visitor requests (for security/manager)
 */
const getAllVisitorRequests = async (query = {}) => {
  const { status, page = 1, limit = 20 } = query;
  const filter = {};
  if (status) filter.status = status;

  const requests = await VisitorRequest.find(filter)
    .populate("user", "email fullname role")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit, 10))
    .lean();

  const total = await VisitorRequest.countDocuments(filter);

  // Attach visitors, checkins & student info
  const requestIds = requests.map((r) => r._id);
  const visitors = await Visitor.find({
    request: { $in: requestIds },
  }).lean();
  const checkins = await VisitorCheckin.find({
    request: { $in: requestIds },
  }).lean();

  // Get student profiles for the users
  const userIds = requests.map((r) => r.user?._id || r.user);
  const students = await Student.find({ user: { $in: userIds } }).lean();
  const studentMap = {};
  students.forEach((s) => {
    studentMap[s.user.toString()] = s;
  });

  const data = requests.map((r) => {
    const userId = r.user?._id?.toString() || r.user?.toString();
    return {
      ...r,
      id: r._id,
      student: studentMap[userId] || null,
      visitors: visitors
        .filter((v) => v.request.toString() === r._id.toString())
        .map((v) => ({
          ...v,
          id: v._id,
          checkin:
            checkins.find((c) => c.visitor.toString() === v._id.toString()) ||
            null,
        })),
    };
  });

  return { data, total, page: parseInt(page, 10), limit: parseInt(limit, 10) };
};

/**
 * Approve a visitor request (security)
 */
const approveVisitorRequest = async (requestId, userId) => {
  const request = await VisitorRequest.findById(requestId);
  if (!request) throw new Error("Request not found");
  if (request.status !== "pending") {
    throw new Error("Only pending requests can be approved");
  }

  request.status = "approved";
  request.reviewed_at = new Date();
  request.reviewed_by = userId;
  await request.save();

  // Notify the student
  const visitDateStr = new Date(request.visit_date).toLocaleDateString("vi-VN");
  await Notification.create({
    user: request.user,
    title: "Yêu cầu thăm người thân được duyệt",
    message: `Yêu cầu ${request.request_code} của bạn đã được duyệt. Người thân có thể đến thăm vào ngày ${visitDateStr} từ ${request.visit_time_from} đến ${request.visit_time_to}.`,
    notification_type: "success",
    category: "visitor",
    related_id: request._id.toString(),
  });

  return request;
};

/**
 * Reject a visitor request (security)
 */
const rejectVisitorRequest = async (requestId, userId, reason) => {
  const request = await VisitorRequest.findById(requestId);
  if (!request) throw new Error("Request not found");
  if (request.status !== "pending") {
    throw new Error("Only pending requests can be rejected");
  }

  request.status = "rejected";
  request.rejection_reason = reason || "";
  request.reviewed_at = new Date();
  request.reviewed_by = userId;
  await request.save();

  // Notify the student
  const reasonText = reason ? ` Lý do: ${reason}` : "";
  await Notification.create({
    user: request.user,
    title: "Yêu cầu thăm người thân bị từ chối",
    message: `Yêu cầu ${request.request_code} của bạn đã bị từ chối.${reasonText}`,
    notification_type: "warning",
    category: "visitor",
    related_id: request._id.toString(),
  });

  return request;
};

/**
 * Complete a visitor request (security marks it manually)
 */
const completeVisitorRequest = async (requestId, userId) => {
  const request = await VisitorRequest.findById(requestId);
  if (!request) throw new Error("Request not found");
  if (request.status !== "approved") {
    throw new Error("Only approved requests can be completed");
  }

  // Check all visitors have checked out
  const visitors = await Visitor.find({ request: requestId });
  const checkins = await VisitorCheckin.find({ request: requestId });

  for (const visitor of visitors) {
    const checkin = checkins.find(
      (c) => c.visitor.toString() === visitor._id.toString()
    );
    if (!checkin || !checkin.check_out_time) {
      throw new Error(
        "All visitors must be checked out before completing the request"
      );
    }
  }

  request.status = "completed";
  await request.save();
  return request;
};

/**
 * Check in a visitor (security)
 */
const checkinVisitor = async (requestId, visitorId, userId) => {
  const request = await VisitorRequest.findById(requestId);
  if (!request) throw new Error("Request not found");
  if (request.status !== "approved") {
    throw new Error("Request must be approved before check-in");
  }

  const visitor = await Visitor.findOne({
    _id: visitorId,
    request: requestId,
  });
  if (!visitor) throw new Error("Visitor not found in this request");

  // Check if already checked in
  const existing = await VisitorCheckin.findOne({
    request: requestId,
    visitor: visitorId,
    check_out_time: null,
  });
  if (existing) throw new Error("Visitor is already checked in");

  const checkin = await VisitorCheckin.create({
    request: requestId,
    visitor: visitorId,
    check_in_time: new Date(),
    checked_in_by: userId,
  });

  return checkin;
};

/**
 * Check out a visitor (security)
 */
const checkoutVisitor = async (checkinId, userId) => {
  const checkin = await VisitorCheckin.findById(checkinId);
  if (!checkin) throw new Error("Check-in record not found");
  if (checkin.check_out_time) throw new Error("Visitor already checked out");

  checkin.check_out_time = new Date();
  checkin.checked_out_by = userId;
  await checkin.save();

  return checkin;
};

/**
 * Get active visitors in dorm (checked in but not checked out)
 */
const getActiveVisitors = async () => {
  const checkins = await VisitorCheckin.find({ check_out_time: null })
    .populate({
      path: "visitor",
      select: "full_name citizen_id phone relationship",
    })
    .populate({
      path: "request",
      select: "request_code user visit_date visit_time_from visit_time_to",
      populate: { path: "user", select: "email fullname" },
    })
    .sort({ check_in_time: -1 })
    .lean();

  // Attach student info
  const userIds = checkins
    .map((c) => c.request?.user?._id || c.request?.user)
    .filter(Boolean);
  const students = await Student.find({ user: { $in: userIds } }).lean();
  const studentMap = {};
  students.forEach((s) => {
    studentMap[s.user.toString()] = s;
  });

  return checkins.map((c) => {
    const userId =
      c.request?.user?._id?.toString() || c.request?.user?.toString();
    return {
      ...c,
      id: c._id,
      student: studentMap[userId] || null,
    };
  });
};

/**
 * Get visitor request detail with all visitors and checkin records
 */
const getVisitorRequestDetail = async (requestId) => {
  const request = await VisitorRequest.findById(requestId)
    .populate("user", "email fullname")
    .populate("reviewed_by", "email fullname")
    .lean();

  if (!request) throw new Error("Request not found");

  const visitors = await Visitor.find({ request: requestId }).lean();
  const checkins = await VisitorCheckin.find({ request: requestId }).lean();

  // Get student profile
  const userId = request.user?._id?.toString() || request.user?.toString();
  const student = await Student.findOne({ user: userId }).lean();

  return {
    ...request,
    id: request._id,
    student,
    visitors: visitors.map((v) => ({
      ...v,
      id: v._id,
      checkin: checkins.find(
        (c) => c.visitor.toString() === v._id.toString()
      ) || null,
    })),
  };
};

module.exports = {
  createVisitorRequest,
  getMyVisitorRequests,
  cancelVisitorRequest,
  getAllVisitorRequests,
  approveVisitorRequest,
  rejectVisitorRequest,
  completeVisitorRequest,
  checkinVisitor,
  checkoutVisitor,
  getActiveVisitors,
  getVisitorRequestDetail,
};
