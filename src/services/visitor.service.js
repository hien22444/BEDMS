const { VisitorRequest, Visitor, VisitorCheckin, User, Student } = require("../models");

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
  const { visit_date, purpose, visitors } = body;

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

  // Validate each visitor
  for (const v of visitors) {
    if (!v.full_name || !v.citizen_id || !v.phone || !v.relationship) {
      throw new Error(
        "Each visitor must have full_name, citizen_id, phone, and relationship"
      );
    }
  }

  const request_code = await generateRequestCode();

  const request = await VisitorRequest.create({
    request_code,
    user: userId,
    visit_date,
    visit_time_from: "07:00",
    visit_time_to: "17:00",
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
