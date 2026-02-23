const XLSX = require("xlsx");
const { User, Student, Staff } = require("../models");

const VALID_IMPORT_ROLES = ["student", "manager", "security"];
const DEFAULT_PASSWORD = "Student@123";

// ─── Column Mapping ───────────────────────────────────────
// Map normalized header → standard field name
const COLUMN_MAP = {
  email: "email",
  "e-mail": "email",
  "fullname": "fullName",
  "full name": "fullName",
  "full_name": "fullName",
  "hovaten": "fullName",
  "studentcode": "studentCode",
  "student code": "studentCode",
  "student_code": "studentCode",
  "masinhvien": "studentCode",
  "staffcode": "staffCode",
  "staff code": "staffCode",
  "staff_code": "staffCode",
  "manhanvien": "staffCode",
  role: "role",
  dob: "dob",
  "dateofbirth": "dob",
  "date of birth": "dob",
  "date_of_birth": "dob",
  "ngaysinh": "dob",
  gender: "gender",
  "gioitinh": "gender",
  phone: "phone",
  "phonenumber": "phone",
  "phone number": "phone",
  "phone_number": "phone",
  "sodienthoai": "phone",
  major: "major",
  "nganh": "major",
  cohort: "cohort",
  "khoahoc": "cohort",
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
          `Phát hiện cột trùng lặp: "${rawHeader}" đã được map đến "${standardField}" (cột khác cũng map đến field này)`
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

const parseAndValidateRow = (row, rowNumber, duplicateSets) => {
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
    throw new Error(`Invalid characters in name: "${fullName}". Only letters, spaces, hyphens, dots allowed`);
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

  // Phone validation (if provided)
  if (phone && !isNA(phone) && !PHONE_REGEX.test(phone)) {
    throw new Error(`Invalid phone: "${phone}". Only digits, +, spaces, hyphens allowed`);
  }

  if (rawRole === "student") {
    if (isNA(studentCode) || !studentCode) {
      throw new Error("Missing required field: student code (for role student)");
    }
    if (!STUDENT_CODE_REGEX.test(studentCode)) {
      throw new Error(`Invalid student code: "${studentCode}". Only letters and numbers allowed`);
    }
    if (existingStudentCodeSet.has(studentCode) || batchStudentCodes.has(studentCode)) {
      throw new Error(`Student code already exists: ${studentCode}`);
    }

    const gender = rawGender.toLowerCase();
    if (!["male", "female", "other"].includes(gender)) {
      throw new Error(`Invalid gender: "${rawGender}". Must be: Male, Female, Other`);
    }

    const dateOfBirth = parseDate(rawDOB);
    if (!dateOfBirth) {
      throw new Error("Missing or invalid DOB (for role student)");
    }

    if (!phone || isNA(phone)) {
      throw new Error("Missing required field: Phone (for role student)");
    }

    // Major validation (if provided)
    if (major && !isNA(major) && !GENERAL_TEXT_REGEX.test(major)) {
      throw new Error(`Invalid characters in major: "${major}"`);
    }

    // Cohort validation (if provided)
    if (cohort && !isNA(cohort) && !GENERAL_TEXT_REGEX.test(cohort)) {
      throw new Error(`Invalid characters in cohort: "${cohort}"`);
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
      major: isNA(major) ? undefined : major,
      cohort: isNA(cohort) ? undefined : cohort,
    };
  } else {
    // manager or security
    if (isNA(staffCode) || !staffCode) {
      throw new Error("Missing required field: staff code (for role staff)");
    }
    if (!STAFF_CODE_REGEX.test(staffCode)) {
      throw new Error(`Invalid staff code: "${staffCode}". Only letters and numbers allowed`);
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
      dateOfBirth: null,
      gender: null,
      phone: isNA(phone) ? undefined : phone,
      major: null,
      cohort: null,
    };
  }
};

// ─── Main Service Functions ────────────────────────────────

const getAllUsers = async () => {
  const users = await User.find();
  return users;
};

const deleteUser = async (id) => {
  const user = await User.findById(id).populate({ path: "totalOrder" });

  if (!user) {
    throw new Error("User not found");
  }

  if (!!user.totalOrder) {
    throw new Error("Cannot delete users with existing orders");
  }

  await user.deleteOne({ _id: id });
};

const importFromExcel = async (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const warnings = [];

  if (!workbook.SheetNames.length) {
    throw new Error("Excel file has no sheets");
  }

  // ── #1: Đọc TẤT CẢ các sheet ────────────────────────────
  if (workbook.SheetNames.length > 1) {
    warnings.push(
      `File has ${workbook.SheetNames.length} sheet(s): ${workbook.SheetNames.map((s) => `"${s}"`).join(", ")}. Reading all.`
    );
  }

  let allRawRows = [];
  const emptySheets = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!sheetRows.length) {
      emptySheets.push(sheetName);
      continue;
    }

    // Tag each row with sheet name for better error reporting
    for (const row of sheetRows) {
      row.__sheetName = sheetName;
    }

    allRawRows = allRawRows.concat(sheetRows);
  }

  if (emptySheets.length > 0) {
    warnings.push(
      `Empty sheets (skipped): ${emptySheets.map((s) => `"${s}"`).join(", ")}`
    );
  }

  if (!allRawRows.length) {
    throw new Error("Excel file is empty or has no data in any sheet");
  }

  // ── #5 & #2: Normalize headers & validate columns ───────
  const rawHeaders = Object.keys(allRawRows[0]).filter((h) => h !== "__sheetName");
  const { fieldMap, unmappedHeaders, missingRequired } = mapColumns(rawHeaders);

  if (missingRequired.length > 0) {
    const friendlyNames = {
      email: "Email",
      fullName: "Full Name",
      role: "Role",
    };
    const missing = missingRequired.map((f) => friendlyNames[f] || f);
    throw new Error(
      `File is missing required columns: ${missing.join(", ")}. Please check the Excel file headers.`
    );
  }

  if (unmappedHeaders.length > 0) {
    warnings.push(
      `Unrecognized columns (will be ignored): ${unmappedHeaders.map((h) => `"${h}"`).join(", ")}`
    );
  }

  // Standardize all rows using column mapping
  const rows = allRawRows.map((rawRow) => {
    const standardized = standardizeRow(rawRow, fieldMap);
    standardized.__sheetName = rawRow.__sheetName;
    return standardized;
  });

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
    const rowNumber = i + 2; // +1 for 0-index, +1 for header

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
        });
      } else {
        await Staff.create({
          user: user._id,
          staff_code: parsed.staffCode,
          full_name: parsed.fullName,
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
