const xlsx = require('xlsx');
const AppError = require('../utils/AppError');
const { EWUsage, Block, Room, Bed } = require('../models');

/**
 * Get list of EW usages with filters and pagination
 */
const getEWUsages = async (query) => {
  const { block_name, type, month, year, page = 1, limit = 20 } = query;

  const filter = {};

  if (block_name) {
    filter.block_name = { $regex: block_name, $options: 'i' };
  }
  if (type && ['electric', 'water'].includes(type)) {
    filter.type = type;
  }
  if (month) {
    const m = parseInt(month, 10);
    filter.$expr = {
      $and: [
        { $eq: [{ $month: '$date' }, m] },
        ...(year ? [{ $eq: [{ $year: '$date' }, parseInt(year, 10)] }] : []),
      ],
    };
  } else if (year) {
    filter.$expr = { $eq: [{ $year: '$date' }, parseInt(year, 10)] };
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const total = await EWUsage.countDocuments(filter);
  const data = await EWUsage.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10))
    .lean();

  return {
    data,
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / parseInt(limit, 10)),
  };
};

/**
 * Create a single EW usage record
 */
const createEWUsage = async (body) => {
  const { block: blockId, type, meter_left, meter_right = 0, date, term } = body;

  const block = await Block.findById(blockId).populate('dorm').lean();
  if (!block) throw new AppError(404, 'Block not found');

  const unit = type === 'electric' ? 'kW' : 'm³';
  const consumption = meter_right > 0 ? meter_right - meter_left : 0;

  const record = new EWUsage({
    block: block._id,
    dorm: block.dorm._id || block.dorm,
    block_name: block.block_name || block.block_code,
    type,
    meter_left,
    meter_right,
    consumption,
    date: new Date(date),
    term,
    unit,
  });

  await record.save();
  return record.toJSON();
};

/**
 * Update an EW usage record
 */
const updateEWUsage = async (id, body) => {
  const record = await EWUsage.findById(id);
  if (!record) throw new AppError(404, 'Record not found');

  const { meter_left, meter_right, date, term, type } = body;

  if (meter_left !== undefined) record.meter_left = meter_left;
  if (meter_right !== undefined) record.meter_right = meter_right;
  if (date !== undefined) record.date = new Date(date);
  if (term !== undefined) record.term = term;
  if (type !== undefined) {
    record.type = type;
    record.unit = type === 'electric' ? 'kW' : 'm³';
  }

  // Recalculate consumption
  if (record.meter_right > 0) {
    record.consumption = record.meter_right - record.meter_left;
  } else {
    record.consumption = 0;
  }

  await record.save({ validateBeforeSave: false });
  return record.toJSON();
};

/**
 * Reset meter (set meter_right = 0, consumption = 0)
 */
const resetMeter = async (id) => {
  const record = await EWUsage.findById(id);
  if (!record) throw new AppError(404, 'Record not found');

  record.meter_right = 0;
  record.consumption = 0;
  await record.save({ validateBeforeSave: false });
  return record.toJSON();
};

/**
 * Đếm số bed đang occupied trong 1 block
 */
const countOccupiedBeds = async (blockId) => {
  const rooms = await Room.find({ block: blockId }).lean();
  if (rooms.length === 0) return 0;
  const roomIds = rooms.map((r) => r._id);
  return Bed.countDocuments({ room: { $in: roomIds }, status: 'occupied' });
};

/**
 * Import EW usages from Excel buffer
 * Excel columns: A=Dorm, B=Block, C=Type(E/W), D=Date, E=Meter, F=Term
 *
 * Validations:
 * 1. Required fields + format
 * 2. Date không quá 2 năm trong quá khứ
 * 3. Duplicate trong cùng file (block + type trùng nhau)
 * 4. Đã tồn tại trong DB với cùng block + type + term → báo duplicate (không ghi đè)
 */
const importEWUsages = async (fileBuffer) => {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  let created = 0;
  let duplicateInFile = 0;
  let duplicateInDB = 0;
  let failed = 0;
  const errors = [];

  // Track keys seen in this file to detect in-file duplicates: "block|type"
  const seenInFile = new Set();
  const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

  // Skip header row (row 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const [dormCode, blockCode, typeCode, dateRaw, meterRaw, termRaw] = row;

    try {
      // ── 1. Validate required fields ───────────────────────────
      const validationErrors = [];

      if (!dormCode || String(dormCode).trim() === '')
        validationErrors.push('Dorm (cột A) không được để trống');

      if (!blockCode || String(blockCode).trim() === '')
        validationErrors.push('Block (cột B) không được để trống');

      if (!typeCode || !['E', 'W'].includes(String(typeCode).trim().toUpperCase()))
        validationErrors.push('Type (cột C) phải là E (điện) hoặc W (nước)');

      if (!dateRaw)
        validationErrors.push('Date (cột D) không được để trống');

      if (meterRaw === undefined || meterRaw === null || meterRaw === '')
        validationErrors.push('Meter (cột E) không được để trống');
      else if (isNaN(Number(meterRaw)) || Number(meterRaw) < 0)
        validationErrors.push('Meter (cột E) phải là số không âm (0 = không có người ở)');

      if (!termRaw || String(termRaw).trim() === '')
        validationErrors.push('Term (cột F) không được để trống');

      if (validationErrors.length > 0)
        throw new Error(validationErrors.join('; '));

      const type = String(typeCode).trim().toUpperCase() === 'E' ? 'electric' : 'water';
      const meter_left = Number(meterRaw);
      const term = String(termRaw).trim();

      // ── 2. Parse & validate date ──────────────────────────────
      let parsedDate;
      if (typeof dateRaw === 'number') {
        const d = xlsx.SSF.parse_date_code(dateRaw);
        parsedDate = new Date(d.y, d.m - 1, d.d);
      } else {
        parsedDate = new Date(dateRaw);
      }
      if (isNaN(parsedDate.getTime()))
        throw new Error('Date (cột D) không hợp lệ');

      // Không cho phép date quá 2 năm trong quá khứ
      if (Date.now() - parsedDate.getTime() > TWO_YEARS_MS)
        throw new Error(`Date (cột D) quá xa trong quá khứ (${parsedDate.toLocaleDateString('vi-VN')})`);

      // ── 3. Detect duplicate trong cùng file (block + type + date + term) ──
      const dateKey = parsedDate.toISOString().slice(0, 10); // YYYY-MM-DD
      const fileKey = `${String(blockCode).trim().toUpperCase()}|${type}|${dateKey}|${term}`;
      if (seenInFile.has(fileKey)) {
        duplicateInFile++;
        errors.push({ row: i + 1, block: blockCode, error: `Trùng lặp trong file: block ${blockCode}, loại ${type === 'electric' ? 'Điện' : 'Nước'}, ngày ${parsedDate.toLocaleDateString('vi-VN')}, học kỳ "${term}" xuất hiện nhiều lần` });
        continue;
      }
      seenInFile.add(fileKey);

      // ── 4. Find block in DB ───────────────────────────────────
      const block = await Block.findOne({ block_code: String(blockCode).trim() }).populate('dorm');
      if (!block) throw new Error(`Block không tìm thấy trong hệ thống: ${blockCode}`);

      // ── 5. Detect duplicate trong DB (cùng block + type + term) ──
      const existingByTerm = await EWUsage.findOne({ block: block._id, type, term });
      if (existingByTerm) {
        duplicateInDB++;
        errors.push({
          row: i + 1,
          block: blockCode,
          error: `Đã tồn tại bản ghi block ${blockCode} loại ${type === 'electric' ? 'Điện' : 'Nước'} trong học kỳ "${term}" (chỉ số: ${existingByTerm.meter_left})`,
        });
        continue;
      }

      // ── 6. Tìm chỉ số cũ từ record gần nhất của cùng block + type ──
      const PRICE_PER_UNIT = 3000;
      const unit = type === 'electric' ? 'kW' : 'm³';
      const new_meter = meter_left; // giá trị nhập từ Excel

      // Đếm occupied beds trong block
      const occupied_beds = await countOccupiedBeds(block._id);

      // meter = 0 → block không có người ở → lưu với chỉ số 0, không tính tiền
      if (new_meter === 0) {
        await EWUsage.create({
          block: block._id,
          dorm: block.dorm._id || block.dorm,
          block_name: block.block_name || block.block_code,
          type,
          meter_left: 0,
          meter_right: 0,
          consumption: 0,
          amount: 0,
          price_per_unit: PRICE_PER_UNIT,
          occupied_beds,
          amount_per_bed: 0,
          date: parsedDate,
          term,
          unit,
        });
        created++;
        continue;
      }

      // Lấy record gần nhất của block + type để lấy chỉ số cũ
      const prevRecord = await EWUsage.findOne({ block: block._id, type })
        .sort({ date: -1 })
        .lean();

      const old_meter = prevRecord ? prevRecord.meter_right || prevRecord.meter_left : 0;
      const consumption = new_meter - old_meter;
      const amount = consumption > 0 ? consumption * PRICE_PER_UNIT : 0;
      // Chia đều cho số bed đang có người ở trong block
      const amount_per_bed = occupied_beds > 0 ? Math.round(amount / occupied_beds) : 0;

      await EWUsage.create({
        block: block._id,
        dorm: block.dorm._id || block.dorm,
        block_name: block.block_name || block.block_code,
        type,
        meter_left: old_meter,
        meter_right: new_meter,
        consumption,
        amount,
        price_per_unit: PRICE_PER_UNIT,
        occupied_beds,
        amount_per_bed,
        date: parsedDate,
        term,
        unit,
      });
      created++;
    } catch (err) {
      failed++;
      errors.push({ row: i + 1, block: blockCode, error: err.message });
    }
  }

  return { created, duplicateInFile, duplicateInDB, failed, errors };
};

/**
 * Export EW usages to Excel buffer
 */
const exportEWUsages = async (query) => {
  const { block_name, type, month, year } = query;

  const filter = {};
  if (block_name) filter.block_name = { $regex: block_name, $options: 'i' };
  if (type && ['electric', 'water'].includes(type)) filter.type = type;
  if (month || year) {
    const conditions = [];
    if (month) conditions.push({ $eq: [{ $month: '$date' }, parseInt(month, 10)] });
    if (year) conditions.push({ $eq: [{ $year: '$date' }, parseInt(year, 10)] });
    filter.$expr = conditions.length > 1 ? { $and: conditions } : conditions[0];
  }

  const records = await EWUsage.find(filter).sort({ block_name: 1, date: 1 }).lean();

  const sheetData = records.map((r) => ({
    ID: r.id,
    'Tên Block': r.block_name,
    'Loại': r.type === 'electric' ? 'Điện' : 'Nước',
    'Ngày tạo': r.date ? new Date(r.date).toLocaleDateString('vi-VN') : '',
    'Học kỳ': r.term,
    'Công tơ L': r.meter_left,
    'Công tơ R': r.meter_right,
    'Tiêu thụ': r.consumption,
    'Đơn vị': r.unit,
  }));

  const ws = xlsx.utils.json_to_sheet(sheetData);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'EW Usages');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * Get EW usages for the student's current block (student-facing)
 * Looks up student's active contract → room → block → EWUsage records
 */
const getMyEWUsages = async (userId) => {
  const { Contract, Student, Room } = require('../models');

  const student = await Student.findOne({ user: userId }).lean();
  if (!student) throw new AppError(404, 'Student profile not found');

  // Find active contract to get current room
  const contract = await Contract.findOne({
    student: student._id,
    status: { $in: ['active', 'approved'] },
  }).populate('room').lean();

  if (!contract || !contract.room) {
    return { block_name: null, data: [], message: 'No active room assignment found' };
  }

  const room = contract.room;
  const records = await EWUsage.find({
    block: room.block,
    type: 'electric',
    consumption: { $gt: 0 },
  })
    .sort({ date: -1 })
    .lean();

  // Get block name from first record or query block
  const blockName = records[0]?.block_name || null;

  return {
    block_name: blockName,
    room_number: room.room_number,
    data: records.map((r) => ({
      id: r._id,
      term: r.term,
      date: r.date,
      meter_left: r.meter_left,
      meter_right: r.meter_right,
      consumption: r.consumption,
      unit: r.unit,
      price_per_unit: r.price_per_unit,
      occupied_beds: r.occupied_beds,
      total_amount: r.amount,
      amount: r.amount_per_bed,   // số tiền sinh viên phải trả (đã chia đều)
    })),
  };
};

/**
 * Trigger recalculation of per-student consumption
 */
const recalculate = async () => {
  // Placeholder — future: distribute block consumption to students in that block
  return { message: 'Recalculation triggered successfully' };
};

module.exports = {
  getEWUsages,
  createEWUsage,
  updateEWUsage,
  resetMeter,
  importEWUsages,
  exportEWUsages,
  recalculate,
  getMyEWUsages,
};
