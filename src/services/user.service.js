const XLSX = require("xlsx");
const { User, Student, Staff, VisitorRequest, ViolationReport } = require("../models");

const VALID_IMPORT_ROLES = ["student", "manager", "security"];
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || "Student@123";

/**
 * Escape special regex characters to prevent NoSQL injection
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── Column Mapping ───────────────────────────────────────
// Only accept exact template column names (case-insensitive)
const COLUMN_MAP = {
  "email": "email",
  "full name": "fullName",
  "student code": "studentCode",
  "staff code": "staffCode",
  "role": "role",
  "dob": "dob",
  "gender": "gender",
  "phone": "phone",
  "major": "major",
  "cohort": "cohort",
  "student type": "studentType",
};

const REQUIRED_COLUMNS = ["email", "fullName", "role"];

// ─── Helpers ───────────────────────────────────────────────

const normalizeValue = (val) => {
  if (val === null || val === undefined) return "";
  return String(val).trim();
};

const isNA = (val) => {
  const v = normalizeValue(val).toLowerCase();
  return v === "" || v === "n/a" || v === "na" || v === "-";
};

const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + val * 86400000);
  }
  const parsed = new Date(val);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
};

/**
 * Normalize a column header: lowercase, trim, remove extra spaces
 */
const normalizeHeader = (header) => {
  return String(header).trim().toLowerCase().replace(/\s+/g, " ");
};

/**
 * Map raw Excel headers to standard field names.
 * Returns { fieldMap, warnings, missingRequired }
 */
const mapColumns = (rawHeaders) => {
  const fieldMap = {}; // rawHeader → standardField
  const mappedFields = new Set();
  const unmappedHeaders = [];

  for (const rawHeader of rawHeaders) {
    const normalized = normalizeHeader(rawHeader);
    const standardField = COLUMN_MAP[normalized];

    if (standardField) {
      if (mappedFields.has(standardField)) {
        throw new Error(
          `Duplicate column detected: "${rawHeader}" maps to "${standardField}" (another column already maps to this field)`
        );
      }
      fieldMap[rawHeader] = standardField;
      mappedFields.add(standardField);
    } else {
      unmappedHeaders.push(rawHeader);
    }
  }

  // Check required columns
  const missingRequired = REQUIRED_COLUMNS.filter((f) => !mappedFields.has(f));

  return { fieldMap, unmappedHeaders, missingRequired, mappedFields };
};

/**
 * Convert a raw row to standardized row using fieldMap
 */
const standardizeRow = (rawRow, fieldMap) => {
  const result = {};
  for (const [rawHeader, standardField] of Object.entries(fieldMap)) {
    if (rawRow[rawHeader] !== undefined && result[standardField] === undefined) {
      result[standardField] = rawRow[rawHeader];
    }
  }
  return result;
};

// ─── Validation Patterns ──────────────────────────────────

// Full name: letters, Vietnamese chars, spaces, hyphens, dots, apostrophes
const NAME_REGEX = /^[\p{L}\s.\-']+$/u;

// Student code: alphanumeric only (e.g. SE171234, SB12345)
const STUDENT_CODE_REGEX = /^[A-Za-z0-9]+$/;

// Staff code: alphanumeric only (e.g. STF001)
const STAFF_CODE_REGEX = /^[A-Za-z0-9]+$/;

// Phone: digits, optional leading +, optional spaces/dashes (e.g. +84 912 345 678)
const PHONE_REGEX = /^\+?[\d\s\-()]{8,15}$/;

// Major/Cohort: letters, digits, spaces, hyphens, dots
const GENERAL_TEXT_REGEX = /^[\p{L}\d\s.\-/()]+$/u;

const parseAndValidateRow = (row, _rowNumber, duplicateSets) => {
  const {
    existingEmailSet,
    existingStudentCodeSet,
    existingStaffCodeSet,
    batchEmails,
    batchStudentCodes,
    batchStaffCodes,
  } = duplicateSets;

  const email = normalizeValue(row.email || "").toLowerCase();
  const fullName = normalizeValue(row.fullName || "");
  const studentCode = normalizeValue(row.studentCode || "");
  const staffCode = normalizeValue(row.staffCode || "");
  const rawRole = normalizeValue(row.role || "").toLowerCase();
  const rawDOB = row.dob || "";
  const rawGender = normalizeValue(row.gender || "");
  const phone = normalizeValue(row.phone || "");
  const major = normalizeValue(row.major || "");
  const cohort = normalizeValue(row.cohort || "");
  const rawStudentType = normalizeValue(row.studentType || "").toLowerCase();

  // Email
  if (!email) {
    throw new Error("Missing required field: email");
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error(`Invalid email: ${email}`);
  }

  // Full name
  if (!fullName) {
    throw new Error("Missing required field: full name");
  }
  if (!NAME_REGEX.test(fullName)) {
    throw new Error(`Name contains invalid characters: "${fullName}". Only letters, spaces, hyphens, dots allowed`);
  }

  // Role
  if (!rawRole) {
    throw new Error("Missing required field: role");
  }
  if (!VALID_IMPORT_ROLES.includes(rawRole)) {
    throw new Error(`Invalid role: "${rawRole}". Must be: ${VALID_IMPORT_ROLES.join(", ")}`);
  }

  // Duplicate email
  if (existingEmailSet.has(email) || batchEmails.has(email)) {
    throw new Error(`Email already exists: ${email}`);
  }

  // ── Required fields for ALL roles: DOB, Gender, Phone ──

  const dateOfBirth = parseDate(rawDOB);
  if (!dateOfBirth) {
    throw new Error("Missing or invalid: DOB");
  }

  const gender = rawGender.toLowerCase();
  if (!["male", "female", "other"].includes(gender)) {
    throw new Error(`Invalid gender: "${rawGender}". Must be: Male, Female, Other`);
  }

  if (!phone || isNA(phone)) {
    throw new Error("Missing required field: Phone");
  }
  if (!PHONE_REGEX.test(phone)) {
    throw new Error(`Invalid phone: "${phone}". Only digits, +, spaces, hyphens allowed`);
  }

  // ── Role-specific validation ───────────────────────────────

  if (rawRole === "student") {
    if (isNA(studentCode) || !studentCode) {
      throw new Error("Missing required field: student code (for student role)");
    }
    if (!STUDENT_CODE_REGEX.test(studentCode)) {
      throw new Error(`Student code contains invalid characters: "${studentCode}". Only letters and digits allowed`);
    }
    if (existingStudentCodeSet.has(studentCode) || batchStudentCodes.has(studentCode)) {
      throw new Error(`Student code already exists: ${studentCode}`);
    }

    // Major (required for students)
    if (isNA(major) || !major) {
      throw new Error("Missing required field: major (for student role)");
    }
    if (!GENERAL_TEXT_REGEX.test(major)) {
      throw new Error(`Major contains invalid characters: "${major}"`);
    }

    // Cohort (required for students)
    if (isNA(cohort) || !cohort) {
      throw new Error("Missing required field: cohort (for student role)");
    }
    if (!GENERAL_TEXT_REGEX.test(cohort)) {
      throw new Error(`Cohort contains invalid characters: "${cohort}"`);
    }

    // Student type (required for students)
    if (!rawStudentType || isNA(rawStudentType)) {
      throw new Error("Missing required field: student type (for student role)");
    }
    if (!["domestic", "international"].includes(rawStudentType)) {
      throw new Error(`Invalid student type: "${rawStudentType}". Must be: domestic, international`);
    }

    return {
      email,
      fullName,
      role: rawRole,
      studentCode,
      staffCode: null,
      dateOfBirth,
      gender,
      phone,
      major,
      cohort,
      studentType: rawStudentType,
    };
  } else {
    // manager or security
    if (isNA(staffCode) || !staffCode) {
      throw new Error("Missing required field: staff code (for staff role)");
    }
    if (!STAFF_CODE_REGEX.test(staffCode)) {
      throw new Error(`Staff code contains invalid characters: "${staffCode}". Only letters and digits allowed`);
    }
    if (existingStaffCodeSet.has(staffCode) || batchStaffCodes.has(staffCode)) {
      throw new Error(`Staff code already exists: ${staffCode}`);
    }

    return {
      email,
      fullName,
      role: rawRole,
      studentCode: null,
      staffCode,
      dateOfBirth,
      gender,
      phone,
      major: null,
      cohort: null,
    };
  }
};

// ─── Main Service Functions ────────────────────────────────

const getAllUsers = async (query = {}) => {
  const { page = 1, limit = 10, role, search } = query;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = {};
  if (role && role !== "all") {
    filter.role = role;
  }
  if (search) {
    const safeSearch = escapeRegex(search);
    filter.$or = [
      { email: { $regex: safeSearch, $options: "i" } },
      { fullname: { $regex: safeSearch, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    User.countDocuments(filter),
  ]);

  // Batch lookup profiles
  const userIds = users.map((u) => u._id);
  const [students, staffs] = await Promise.all([
    Student.find({ user: { $in: userIds } }).lean(),
    Staff.find({ user: { $in: userIds } }).lean(),
  ]);

  const studentMap = {};
  for (const s of students) {
    studentMap[s.user.toString()] = s;
  }
  const staffMap = {};
  for (const s of staffs) {
    staffMap[s.user.toString()] = s;
  }

  // Merge profile into user
  const items = users.map((u) => {
    const id = u._id.toString();
    const profile = studentMap[id] || staffMap[id] || null;
    return {
      id: u._id,
      email: u.email,
      fullname: u.fullname,
      role: u.role,
      is_active: u.is_active,
      last_login: u.last_login,
      createdAt: u.createdAt,
      code: profile?.student_code || profile?.staff_code || null,
      phone: profile?.phone || null,
      gender: profile?.gender || null,
      major: profile?.major || null,
      cohort: profile?.cohort || null,
    };
  });

  return {
    items,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const deleteUser = async (id) => {
  const user = await User.findById(id);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  if (user.role === "admin") {
    throw new Error("Admin accounts cannot be deleted");
  }

  // Guard: find the student/staff profile to check linked records
  const student = await Student.findOne({ user: id });
  if (student) {
    const [visitorCount, violationCount] = await Promise.all([
      VisitorRequest.countDocuments({ user: id }),
      ViolationReport.countDocuments({ reported_student: student._id }),
    ]);
    if (visitorCount > 0) {
      throw new Error(`Cannot delete user: has ${visitorCount} visitor request(s) on record.`);
    }
    if (violationCount > 0) {
      throw new Error(`Cannot delete user: has ${violationCount} violation report(s) on record.`);
    }
  }

  await user.deleteOne();
};

const importFromExcel = async (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const warnings = [];

  if (!workbook.SheetNames.length) {
    throw new Error("Excel file has no sheets");
  }

  // ── #1: Read ALL sheets ────────────────────────────────────
  if (workbook.SheetNames.length > 1) {
    warnings.push(
      `File has ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.map((s) => `"${s}"`).join(", ")}. Reading all.`
    );
  }

  const rows = [];
  const emptySheets = [];
  const friendlyNames = {
    email: "Email",
    fullName: "Full Name",
    role: "Role",
  };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!sheetRows.length) {
      emptySheets.push(sheetName);
      continue;
    }

    // ── #5 & #2: Map columns per sheet ─────────────────────
    const rawHeaders = Object.keys(sheetRows[0]);
    const { fieldMap, unmappedHeaders, missingRequired } = mapColumns(rawHeaders);

    if (missingRequired.length > 0) {
      const missing = missingRequired.map((f) => friendlyNames[f] || f);
      warnings.push(
        `Sheet "${sheetName}" missing required columns: ${missing.join(", ")} - skipping entire sheet.`
      );
      continue;
    }

    if (unmappedHeaders.length > 0) {
      warnings.push(
        `Sheet "${sheetName}" has unrecognized columns (ignored): ${unmappedHeaders.map((h) => `"${h}"`).join(", ")}`
      );
    }

    // Standardize rows using this sheet's fieldMap
    for (let i = 0; i < sheetRows.length; i++) {
      const standardized = standardizeRow(sheetRows[i], fieldMap);
      standardized.__sheetName = sheetName;
      standardized.__rowInSheet = i + 2; // +1 for 0-index, +1 for header
      rows.push(standardized);
    }
  }

  if (emptySheets.length > 0) {
    warnings.push(
      `Empty sheets (skipped): ${emptySheets.map((s) => `"${s}"`).join(", ")}`
    );
  }

  if (!rows.length) {
    throw new Error("Excel file is empty or has no valid data in any sheet");
  }

  const imported = [];
  const errors = [];

  // Pre-fetch existing records for duplicate detection
  const allEmails = rows
    .map((r) => normalizeValue(r.email || "").toLowerCase())
    .filter(Boolean);
  const allStudentCodes = rows
    .map((r) => normalizeValue(r.studentCode || ""))
    .filter((v) => v && !isNA(v));
  const allStaffCodes = rows
    .map((r) => normalizeValue(r.staffCode || ""))
    .filter((v) => v && !isNA(v));

  const existingUsers = await User.find({ email: { $in: allEmails } }).lean();
  const existingStudents = await Student.find({ student_code: { $in: allStudentCodes } }).lean();
  const existingStaff = await Staff.find({ staff_code: { $in: allStaffCodes } }).lean();

  const existingEmailSet = new Set(existingUsers.map((u) => u.email));
  const existingStudentCodeSet = new Set(existingStudents.map((s) => s.student_code));
  const existingStaffCodeSet = new Set(existingStaff.map((s) => s.staff_code));

  const batchEmails = new Set();
  const batchStudentCodes = new Set();
  const batchStaffCodes = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = row.__rowInSheet || i + 2;

    let user = null;
    try {
      const parsed = parseAndValidateRow(row, rowNumber, {
        existingEmailSet,
        existingStudentCodeSet,
        existingStaffCodeSet,
        batchEmails,
        batchStudentCodes,
        batchStaffCodes,
      });

      // Create User
      user = await User.create({
        email: parsed.email,
        password_hash: DEFAULT_PASSWORD,
        fullname: parsed.fullName,
        role: parsed.role,
        is_active: true,
      });

      // Create Student or Staff profile
      if (parsed.role === "student") {
        await Student.create({
          user: user._id,
          student_code: parsed.studentCode,
          full_name: parsed.fullName,
          date_of_birth: parsed.dateOfBirth,
          gender: parsed.gender,
          phone: parsed.phone,
          major: parsed.major,
          cohort: parsed.cohort,
          student_type: parsed.studentType,
        });
      } else {
        await Staff.create({
          user: user._id,
          staff_code: parsed.staffCode,
          full_name: parsed.fullName,
          date_of_birth: parsed.dateOfBirth,
          gender: parsed.gender,
          phone: parsed.phone,
          position: parsed.role,
        });
      }

      // Track for intra-batch duplicate detection
      batchEmails.add(parsed.email);
      if (parsed.studentCode) batchStudentCodes.add(parsed.studentCode);
      if (parsed.staffCode) batchStaffCodes.add(parsed.staffCode);

      imported.push({
        row: rowNumber,
        sheet: row.__sheetName || "",
        email: parsed.email,
        role: parsed.role,
        code: parsed.studentCode || parsed.staffCode,
      });
    } catch (err) {
      // Cleanup orphaned User if Student/Staff creation failed
      if (user) {
        await User.deleteOne({ _id: user._id });
      }

      errors.push({
        row: rowNumber,
        sheet: row.__sheetName || "",
        email: normalizeValue(row.email || ""),
        error: err.message,
      });
    }
  }

  return {
    summary: {
      total: rows.length,
      success: imported.length,
      failed: errors.length,
    },
    imported,
    errors,
    warnings,
  };
};

module.exports = {
  getAllUsers,
  deleteUser,
  importFromExcel,
};
