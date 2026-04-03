const xlsx = require('xlsx');
const AppError = require('../utils/AppError');
const { EWUsage, Block, Room, Bed, Dorm, Invoice, InvoiceLineItem, Contract } = require('../models');

const PRICE_MAP = { electric: 3000, water: 9000 };
const getPricePerUnit = (type) => PRICE_MAP[type] || 3000;

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
  const docs = await EWUsage.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));
  const data = docs.map((d) => d.toJSON());

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
  const { block: blockId, type, meter_right = 0, date, term } = body;

  const block = await Block.findById(blockId).populate('dorm').lean();
  if (!block) throw new AppError(404, 'Block not found');

  // Automatically derive meter_left from the latest record for the same block and type
  const prevRecord = await EWUsage.findOne({ block: block._id, type }).sort({ date: -1 }).lean();
  const meter_left = prevRecord
    ? (prevRecord.meter_right != null ? prevRecord.meter_right : prevRecord.meter_left)
    : 0;

  const unit = type === 'electric' ? 'kW' : 'm³';
  const consumption = meter_right > meter_left ? meter_right - meter_left : 0;
  const occupied_beds = await countOccupiedBeds(block._id);
  const pricePerUnit = getPricePerUnit(type);
  const amount = consumption > 0 ? consumption * pricePerUnit : 0;

  const record = new EWUsage({
    block: block._id,
    dorm: block.dorm._id || block.dorm,
    block_name: block.block_name || block.block_code,
    type,
    meter_left,
    meter_right,
    consumption,
    amount,
    price_per_unit: pricePerUnit,
    occupied_beds,
    amount_per_bed: occupied_beds > 0 ? Math.round(amount / occupied_beds) : 0,
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

  // Only allow editing the latest record per block + type
  const newerRecord = await EWUsage.findOne({
    block: record.block,
    type: record.type,
    date: { $gt: record.date },
  }).lean();
  if (newerRecord) throw new AppError(400, 'Only the latest record for this block can be edited');

  const { meter_right, term, type } = body;

  if (meter_right !== undefined) record.meter_right = meter_right;
  if (term !== undefined) record.term = term;
  if (type !== undefined) {
    record.type = type;
    record.unit = type === 'electric' ? 'kW' : 'm³';
  }

  // Find previous record (same block + type, earlier date)
  const prevRecord = await EWUsage.findOne({
    block: record.block,
    type: record.type,
    _id: { $ne: record._id },
    date: { $lt: record.date },
  })
    .sort({ date: -1 })
    .lean();

  const old_meter = prevRecord
    ? (prevRecord.meter_right != null ? prevRecord.meter_right : prevRecord.meter_left)
    : 0;
  record.meter_left = old_meter;
  record.consumption = record.meter_right > old_meter ? record.meter_right - old_meter : 0;

  const pricePerUnit = getPricePerUnit(record.type);
  record.price_per_unit = pricePerUnit;
  record.amount = record.consumption > 0 ? record.consumption * pricePerUnit : 0;
  const occupied_beds = await countOccupiedBeds(record.block);
  record.occupied_beds = occupied_beds;
  record.amount_per_bed = occupied_beds > 0 ? Math.round(record.amount / occupied_beds) : 0;
  // Reset is_billed so next recalculation picks it up
  record.is_billed = false;

  await record.save({ validateBeforeSave: false });
  return record.toJSON();
};

/**
 * Reset meter — replace physical meter with a new one.
 * Finds the LATEST record for block + type, sets new meter value.
 * Consumption = 0 because the meter was physically replaced.
 */
const resetMeter = async (body) => {
  const { block: blockId, type, meter_right } = body;

  if (!blockId) throw new AppError(400, 'block is required');
  if (!type || !['electric', 'water'].includes(type))
    throw new AppError(400, 'type must be electric or water');
  if (meter_right === undefined || meter_right === null)
    throw new AppError(400, 'meter_right is required');
  if (isNaN(Number(meter_right)) || Number(meter_right) < 0)
    throw new AppError(400, 'meter_right must be a non-negative number');

  // Find the latest record for block + type
  const record = await EWUsage.findOne({ block: blockId, type }).sort({ date: -1 });
  if (!record) throw new AppError(404, 'No record found for this block and type');

  record.meter_right = Number(meter_right);
  record.consumption = 0;
  record.amount = 0;
  record.amount_per_bed = 0;
  record.is_billed = false;
  await record.save({ validateBeforeSave: false });
  return record.toJSON();
};

/**
 * Count occupied beds in a block
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
 * 2. Date not more than 2 years in the past
 * 3. Duplicate within the same file (block + type + month)
 * 4. Already exists in DB for same block + type + month → report duplicate (no overwrite)
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
  let warnings = 0;
  const errors = [];

  // Track keys seen in this file: "DORM|BLOCK|type|YYYY-MM" → detect same block+type+month
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
        validationErrors.push('Dorm (column A) is required');

      if (!blockCode || String(blockCode).trim() === '')
        validationErrors.push('Block (column B) is required');

      if (!typeCode || !['E', 'W'].includes(String(typeCode).trim().toUpperCase()))
        validationErrors.push('Type (column C) must be E (electric) or W (water)');

      if (!dateRaw)
        validationErrors.push('Date (column D) is required');

      if (meterRaw === undefined || meterRaw === null || meterRaw === '')
        validationErrors.push('Meter (column E) is required');
      else if (isNaN(Number(meterRaw)) || Number(meterRaw) < 0)
        validationErrors.push('Meter (column E) must be a non-negative number');

      if (!termRaw || String(termRaw).trim() === '')
        validationErrors.push('Term (column F) is required');

      if (validationErrors.length > 0)
        throw new Error(validationErrors.join('; '));

      const type = String(typeCode).trim().toUpperCase() === 'E' ? 'electric' : 'water';
      const new_meter = Number(meterRaw);
      const term = String(termRaw).trim();

      // ── 2. Parse & validate date ──────────────────────────────
      let parsedDate;
      if (typeof dateRaw === 'number') {
        const d = xlsx.SSF.parse_date_code(dateRaw);
        parsedDate = new Date(d.y, d.m - 1, d.d);
      } else {
        const str = String(dateRaw).trim();
        const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmyMatch) {
          parsedDate = new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
        } else {
          parsedDate = new Date(str);
        }
      }
      if (isNaN(parsedDate.getTime()))
        throw new Error('Date (column D) is invalid');

      if (Date.now() - parsedDate.getTime() > TWO_YEARS_MS)
        throw new Error(`Date (column D) is too far in the past (${parsedDate.toLocaleDateString('en-US')})`);

      // ── 3. Detect duplicates within the same file (block + type + month) ──
      const monthKey = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
      const fileKey = `${String(dormCode).trim().toUpperCase()}|${String(blockCode).trim().toUpperCase()}|${type}|${monthKey}`;
      if (seenInFile.has(fileKey)) {
        duplicateInFile++;
        errors.push({ row: i + 1, block: blockCode, error: `Duplicate in file: block ${blockCode}, type ${type === 'electric' ? 'Electric' : 'Water'}, month ${monthKey} appears multiple times` });
        continue;
      }
      seenInFile.add(fileKey);

      // ── 4. Find block in DB (filter by dorm_code + block_code) ──
      const dormDoc = await Dorm.findOne({ dorm_code: String(dormCode).trim().toUpperCase() }).lean();
      if (!dormDoc) throw new Error(`Dorm not found: ${dormCode}`);

      const block = await Block.findOne({ block_code: String(blockCode).trim(), dorm: dormDoc._id }).populate('dorm');
      if (!block) throw new Error(`Block not found in the system: dorm=${dormCode}, block=${blockCode}`);

      // ── 5. Detect duplicates in the database (same block + type + month) ──
      const monthStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);
      const monthEnd = new Date(parsedDate.getFullYear(), parsedDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const existingInMonth = await EWUsage.findOne({
        block: block._id,
        type,
        date: { $gte: monthStart, $lte: monthEnd },
      });

      // If a record already exists in the same month but was reset (meter_right = 0), allow updating it
      if (existingInMonth && existingInMonth.meter_right > 0) {
        duplicateInDB++;
        errors.push({
          row: i + 1,
          block: blockCode,
          error: `A record already exists for block ${blockCode}, type ${type === 'electric' ? 'Electric' : 'Water'}, month ${monthKey}`,
        });
        continue;
      }

      // ── 6. Calculate meter values ──
      const pricePerUnit = getPricePerUnit(type);
      const unit = type === 'electric' ? 'kW' : 'm³';
      const occupied_beds = await countOccupiedBeds(block._id);

      // Find the latest record for the block + type to determine the previous meter
      const prevQuery = { block: block._id, type };
      if (existingInMonth) prevQuery._id = { $ne: existingInMonth._id };
      const prevRecord = await EWUsage.findOne(prevQuery).sort({ date: -1 }).lean();
      const old_meter = prevRecord
        ? (prevRecord.meter_right != null ? prevRecord.meter_right : prevRecord.meter_left)
        : 0;

      // ── 7. Validate: if the new meter is lower than the old one, warn and set consumption to 0 ──
      let consumption = 0;
      if (new_meter > 0 && old_meter > 0 && new_meter < old_meter) {
        warnings++;
        errors.push({
          row: i + 1,
          block: blockCode,
          error: `Warning: new meter (${new_meter}) < previous meter (${old_meter}) for block ${blockCode}, ${type === 'electric' ? 'Electric' : 'Water'}. The meter may have been reset. Consumption is set to 0`,
        });
      } else if (new_meter > old_meter) {
        consumption = new_meter - old_meter;
      }

      const amount = consumption > 0 ? consumption * pricePerUnit : 0;
      const amount_per_bed = occupied_beds > 0 ? Math.round(amount / occupied_beds) : 0;

      if (existingInMonth) {
        // Update the reset record in the same month
        existingInMonth.meter_left = old_meter;
        existingInMonth.meter_right = new_meter;
        existingInMonth.consumption = consumption;
        existingInMonth.amount = amount;
        existingInMonth.price_per_unit = pricePerUnit;
        existingInMonth.occupied_beds = occupied_beds;
        existingInMonth.amount_per_bed = amount_per_bed;
        existingInMonth.term = term;
        existingInMonth.date = parsedDate;
        existingInMonth.is_billed = false;
        await existingInMonth.save({ validateBeforeSave: false });
        created++;
        continue;
      }

      await EWUsage.create({
        block: block._id,
        dorm: block.dorm._id || block.dorm,
        block_name: block.block_name || block.block_code,
        type,
        meter_left: old_meter,
        meter_right: new_meter,
        consumption,
        amount,
        price_per_unit: pricePerUnit,
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

  return { created, duplicateInFile, duplicateInDB, failed, warnings, errors };
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
    'Block Name': r.block_name,
    'Usage Type': r.type === 'electric' ? 'Electric' : 'Water',
    'Created Date': r.date ? new Date(r.date).toLocaleDateString('en-US') : '',
    Term: r.term,
    'Meter Left': r.meter_left,
    'Meter Right': r.meter_right,
    Consumption: r.consumption,
    Unit: r.unit,
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
    status: 'active',
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
      amount: r.amount_per_bed,   // amount charged to the student after equal split
    })),
  };
};

/**
 * Generate invoice code with EW- prefix (e.g. EW-20260402-0001)
 */
const generateEWInvoiceCode = async () => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `EW-${dateStr}-`;

  const lastInvoice = await Invoice.findOne({
    invoice_code: { $regex: `^${prefix}` },
  }).sort({ invoice_code: -1 });

  let seq = 1;
  if (lastInvoice) {
    const lastSeq = parseInt(lastInvoice.invoice_code.split('-').pop(), 10);
    seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

/**
 * Trigger recalculation: create/update EW invoices for all students in billed blocks
 */
const recalculate = async () => {
  // 1. Find all unbilled EWUsage records with actual consumption
  const unbilledRecords = await EWUsage.find({ is_billed: false, consumption: { $gt: 0 } }).lean();

  if (unbilledRecords.length === 0) {
    return { invoicesCreated: 0, invoicesUpdated: 0, totalStudents: 0, message: 'No unbilled usage data found' };
  }

  // 2. Group by block + month (YYYY-MM extracted from record.date)
  const groups = new Map();
  for (const record of unbilledRecords) {
    const d = new Date(record.date);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const key = `${record.block}_${monthKey}`;
    if (!groups.has(key)) {
      groups.set(key, { blockId: record.block, monthKey, electric: 0, water: 0, ids: [] });
    }
    const g = groups.get(key);
    // Use the total block amount (not amount_per_bed); it will be split during billing
    if (record.type === 'electric') g.electric += record.amount;
    if (record.type === 'water') g.water += record.amount;
    g.ids.push(record._id);
  }

  let invoicesCreated = 0;
  let invoicesUpdated = 0;
  const studentsSeen = new Set();
  const due_date = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  // 3. For each group, find students and create/update invoices
  for (const { blockId, monthKey, electric, water, ids } of groups.values()) {
    const rooms = await Room.find({ block: blockId }, '_id').lean();
    if (!rooms.length) continue;

    const roomIds = rooms.map((r) => r._id);
    const contracts = await Contract.find({
      room: { $in: roomIds },
      status: 'active',
    }).populate('room', 'room_number').lean();

    // Split the total block amount evenly across active contracts
    const contractCount = contracts.length;
    if (!contractCount) continue;

    for (let ci = 0; ci < contracts.length; ci++) {
      const contract = contracts[ci];
      const studentId = contract.student;
      const roomId = contract.room._id;
      studentsSeen.add(studentId.toString());

      // Assign the remainder to the last student to avoid losing money because of rounding
      const isLast = ci === contracts.length - 1;
      const electricPerStudent = Math.floor(electric / contractCount);
      const waterPerStudent = Math.floor(water / contractCount);
      const electricFee = isLast ? electric - electricPerStudent * (contractCount - 1) : electricPerStudent;
      const waterFee = isLast ? water - waterPerStudent * (contractCount - 1) : waterPerStudent;
      const total = electricFee + waterFee;

      try {
        // Check for an existing EW invoice for the same student + month regardless of status
        const existing = await Invoice.findOne({
          student: studentId,
          invoice_month: monthKey,
          invoice_code: { $regex: /^EW-/ },
        });

        if (existing) {
          // Skip paid invoices; do not create duplicates or overwrite them
          if (existing.payment_status === 'paid') continue;

          // Update existing unpaid/overdue/cancelled invoice
          existing.electricity_fee = electricFee;
          existing.water_fee = waterFee;
          existing.total_amount = total;
          if (existing.payment_status === 'cancelled') existing.payment_status = 'unpaid';
          await existing.save();

          // Replace line items
          const lineItems = [];
          if (electricFee > 0) {
            lineItems.push({ invoice: existing._id, item_type: 'electricity', description: `Electricity fee - ${monthKey}`, quantity: 1, unit_price: electricFee });
          }
          if (waterFee > 0) {
            lineItems.push({ invoice: existing._id, item_type: 'water', description: `Water fee - ${monthKey}`, quantity: 1, unit_price: waterFee });
          }
          await InvoiceLineItem.deleteMany({ invoice: existing._id });
          if (lineItems.length) await InvoiceLineItem.insertMany(lineItems);
          invoicesUpdated++;
        } else {
          // Create new invoice
          const invoice_code = await generateEWInvoiceCode();
          const invoice = await Invoice.create({
            invoice_code,
            student: studentId,
            room: roomId,
            invoice_month: monthKey,
            room_fee: 0,
            electricity_fee: electricFee,
            water_fee: waterFee,
            service_fee: 0,
            total_amount: total,
            payment_status: 'unpaid',
            due_date,
          });

          const lineItems = [];
          if (electricFee > 0) {
            lineItems.push({ invoice: invoice._id, item_type: 'electricity', description: `Electricity fee - ${monthKey}`, quantity: 1, unit_price: electricFee });
          }
          if (waterFee > 0) {
            lineItems.push({ invoice: invoice._id, item_type: 'water', description: `Water fee - ${monthKey}`, quantity: 1, unit_price: waterFee });
          }
          if (lineItems.length) await InvoiceLineItem.insertMany(lineItems);
          invoicesCreated++;
        }
      } catch (err) {
        console.error(`[recalculate] Failed to process invoice for student ${studentId}, month ${monthKey}:`, err.message);
        // Do not mark this group as billed if any student processing fails
        continue;
      }
    }

    // 4. Mark all EWUsage records in this group as billed
    await EWUsage.updateMany({ _id: { $in: ids } }, { is_billed: true });
  }

  return {
    invoicesCreated,
    invoicesUpdated,
    totalStudents: studentsSeen.size,
    message: `Recalculation completed: ${invoicesCreated} new invoices, ${invoicesUpdated} updated, ${studentsSeen.size} students`,
  };
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
