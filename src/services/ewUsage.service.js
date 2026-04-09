const xlsx = require('xlsx');
const AppError = require('../utils/AppError');
const { EWUsage, Block, Room, Dorm, Invoice, InvoiceLineItem, Contract } = require('../models');

const PRICE_MAP = { electric: 3000, water: 9000 };
const getPricePerUnit = (type) => PRICE_MAP[type] || 3000;
const deriveTermFromDate = (date) => {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  if (month <= 4) return `Spring-${year}`;
  if (month <= 8) return `Summer-${year}`;
  return `Fall-${year}`;
};
const getNextUsageDate = (date) => {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 2, 0, 12, 0, 0, 0);
};
const getMonthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const getMonthBounds = (date) => {
  const d = new Date(date);
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
  };
};
const buildEWLineItems = (invoiceId, monthKey, electricFee, waterFee) => {
  const lineItems = [];
  if (electricFee > 0) {
    lineItems.push({
      invoice: invoiceId,
      item_type: 'electricity',
      description: `Electricity fee - ${monthKey}`,
      quantity: 1,
      unit_price: electricFee,
      amount: electricFee,
    });
  }
  if (waterFee > 0) {
    lineItems.push({
      invoice: invoiceId,
      item_type: 'water',
      description: `Water fee - ${monthKey}`,
      quantity: 1,
      unit_price: waterFee,
      amount: waterFee,
    });
  }
  return lineItems;
};
const deriveOccupiedBedsFromShare = (totalAmount, studentShare) => {
  if (
    !Number.isFinite(totalAmount) ||
    !Number.isFinite(studentShare) ||
    totalAmount <= 0 ||
    studentShare <= 0
  ) {
    return 0;
  }
  return Math.max(1, Math.round(totalAmount / studentShare));
};
const findRecordInMonth = async (blockId, type, date, excludeId = null) => {
  const { start, end } = getMonthBounds(date);
  const query = {
    block: blockId,
    type,
    date: { $gte: start, $lte: end },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return EWUsage.findOne(query);
};
const assertMonthNotOlderThanLatest = async (blockId, type, date, excludeId = null) => {
  const query = { block: blockId, type };
  if (excludeId) query._id = { $ne: excludeId };

  const latestRecord = await EWUsage.findOne(query).sort({ date: -1 }).lean();
  if (!latestRecord) return;

  const targetMonthKey = getMonthKey(date);
  const latestMonthKey = getMonthKey(latestRecord.date);
  if (targetMonthKey < latestMonthKey) {
    throw new AppError(
      400,
      `Cannot create or import ${type} usage for ${targetMonthKey}. Latest existing month is ${latestMonthKey}`
    );
  }
};
const getBillingContracts = async (blockId, _billingDate, { populateRoom = false } = {}) => {
  const rooms = await Room.find({ block: blockId }, '_id').lean();
  if (!rooms.length) return [];

  const roomIds = rooms.map((room) => room._id);
  let query = Contract.find({
    room: { $in: roomIds },
    status: { $in: ['active', 'extended'] },
  });

  if (populateRoom) {
    query = query.populate('room', 'room_number');
  }

  return query.lean();
};
const getEWInvoiceQuery = (studentId, monthKey) => ({
  student: studentId,
  invoice_month: monthKey,
  invoice_code: { $regex: /^EW-/ },
});
const getBillingTargetsFromExistingInvoices = async (roomIds, monthKey) => {
  if (!roomIds.length) return [];

  const invoices = await Invoice.find({
    room: { $in: roomIds },
    invoice_month: monthKey,
    invoice_code: { $regex: /^EW-/ },
  })
    .sort({ createdAt: -1 })
    .select('_id student room payment_status')
    .lean();

  const canonicalByStudentRoom = new Map();
  invoices.forEach((invoice) => {
    const key = `${invoice.student.toString()}_${invoice.room.toString()}`;
    if (!canonicalByStudentRoom.has(key)) {
      canonicalByStudentRoom.set(key, {
        student: invoice.student,
        room: { _id: invoice.room },
        invoiceId: invoice._id,
        payment_status: invoice.payment_status,
      });
    }
  });

  return Array.from(canonicalByStudentRoom.values());
};
const getGroupKey = (blockId, date) => `${blockId.toString()}_${getMonthKey(date)}`;
const getGroupsFromRecords = (records) => {
  const groups = new Map();
  records.forEach((record) => {
    const key = getGroupKey(record.block, record.date);
    const current = groups.get(key);
    const billingDate = new Date(record.date);
    if (!current || billingDate > current.billingDate) {
      groups.set(key, {
        blockId: record.block,
        monthKey: getMonthKey(record.date),
        billingDate,
      });
    }
  });
  return Array.from(groups.values());
};
const getRecordsForGroup = async (blockId, monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return EWUsage.find({
    block: blockId,
    date: { $gte: start, $lte: end },
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();
};
const getLatestRecordIdsByKeys = async (records) => {
  const keys = [
    ...new Map(
      records.map((record) => [
        `${record.block.toString()}_${record.type}`,
        { block: record.block, type: record.type },
      ])
    ).values(),
  ];
  if (!keys.length) return new Set();

  const candidates = await EWUsage.find({
    $or: keys.map((key) => ({ block: key.block, type: key.type })),
  })
    .sort({ date: -1, createdAt: -1 })
    .select('_id block type')
    .lean();

  const latestIds = new Set();
  const seen = new Set();
  candidates.forEach((candidate) => {
    const key = `${candidate.block.toString()}_${candidate.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    latestIds.add(candidate._id.toString());
  });

  return latestIds;
};
const syncInvoiceLineItems = async (invoiceId, monthKey, electricFee, waterFee) => {
  const lineItems = buildEWLineItems(invoiceId, monthKey, electricFee, waterFee);
  await InvoiceLineItem.deleteMany({ invoice: invoiceId });
  if (lineItems.length) await InvoiceLineItem.insertMany(lineItems);
};
const processBillingGroups = async (groups) => {
  if (!groups.length) {
    return {
      invoicesCreated: 0,
      invoicesUpdated: 0,
      invoicesCancelled: 0,
      totalStudents: 0,
      message: 'No usage groups to process',
    };
  }

  let invoicesCreated = 0;
  let invoicesUpdated = 0;
  let invoicesCancelled = 0;
  const studentsSeen = new Set();
  const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  for (const { blockId, monthKey, billingDate } of groups) {
    const records = await getRecordsForGroup(blockId, monthKey);
    if (!records.length) continue;

    const electric = records
      .filter((record) => record.type === 'electric')
      .reduce((sum, record) => sum + (record.amount || 0), 0);
    const water = records
      .filter((record) => record.type === 'water')
      .reduce((sum, record) => sum + (record.amount || 0), 0);

    const rooms = await Room.find({ block: blockId }, '_id').lean();
    const roomIds = rooms.map((room) => room._id);
    let contracts = await getBillingContracts(blockId, billingDate, { populateRoom: true });
    if (!contracts.length) {
      contracts = await getBillingTargetsFromExistingInvoices(roomIds, monthKey);
    }
    const contractCount = contracts.length;

    if (!contractCount) {
      const orphanInvoices = roomIds.length
        ? await Invoice.find({
            room: { $in: roomIds },
            invoice_month: monthKey,
            invoice_code: { $regex: /^EW-/ },
            payment_status: { $ne: 'paid' },
          })
        : [];

      for (const invoice of orphanInvoices) {
        invoice.electricity_fee = 0;
        invoice.water_fee = 0;
        invoice.total_amount = 0;
        invoice.payment_status = 'cancelled';
        await invoice.save();
        await syncInvoiceLineItems(invoice._id, monthKey, 0, 0);
        invoicesCancelled++;
      }

      await EWUsage.updateMany(
        { _id: { $in: records.map((record) => record._id) } },
        { $set: { occupied_beds: 0, amount_per_bed: 0, is_billed: true } }
      );
      continue;
    }

    let groupHasFailure = false;

    for (let ci = 0; ci < contracts.length; ci++) {
      const contract = contracts[ci];
      const studentId = contract.student;
      const roomId = contract.room._id;
      studentsSeen.add(studentId.toString());

      const isLast = ci === contracts.length - 1;
      const electricPerStudent = Math.floor(electric / contractCount);
      const waterPerStudent = Math.floor(water / contractCount);
      const electricFee = isLast
        ? electric - electricPerStudent * (contractCount - 1)
        : electricPerStudent;
      const waterFee = isLast ? water - waterPerStudent * (contractCount - 1) : waterPerStudent;
      const total = electricFee + waterFee;

      try {
        const existingInvoices = await Invoice.find(getEWInvoiceQuery(studentId, monthKey))
          .sort({ createdAt: -1 })
          .lean();

        let canonical = existingInvoices[0] || null;
        const extras = canonical
          ? existingInvoices.filter(
              (invoice) => invoice._id.toString() !== canonical._id.toString()
            )
          : [];

        if (extras.some((invoice) => invoice.payment_status === 'paid')) {
          throw new AppError(
            400,
            `Multiple paid EW invoices found for student ${studentId} in ${monthKey}`
          );
        }

        if (canonical && canonical.payment_status === 'paid') {
          await Promise.all(
            extras.map((invoice) =>
              Invoice.findByIdAndUpdate(invoice._id, { payment_status: 'cancelled' })
            )
          );
          invoicesCancelled += extras.length;
          continue;
        }

        if (extras.length) {
          await Promise.all(
            extras.map(async (invoice) => {
              await Invoice.findByIdAndUpdate(invoice._id, {
                electricity_fee: 0,
                water_fee: 0,
                total_amount: 0,
                payment_status: 'cancelled',
              });
              await syncInvoiceLineItems(invoice._id, monthKey, 0, 0);
            })
          );
          invoicesCancelled += extras.length;
        }

        if (canonical) {
          const invoice = await Invoice.findById(canonical._id);
          if (!invoice) throw new AppError(404, 'Invoice not found during EW recalculation');

          invoice.room = roomId;
          invoice.electricity_fee = electricFee;
          invoice.water_fee = waterFee;
          invoice.total_amount = total;
          if (invoice.payment_status !== 'paid') {
            invoice.payment_status = total > 0 ? 'unpaid' : 'cancelled';
          }
          await invoice.save();
          await syncInvoiceLineItems(invoice._id, monthKey, electricFee, waterFee);
          invoicesUpdated++;
        } else if (total > 0) {
          const invoiceCode = await generateEWInvoiceCode();
          const invoice = await Invoice.create({
            invoice_code: invoiceCode,
            student: studentId,
            room: roomId,
            invoice_month: monthKey,
            room_fee: 0,
            electricity_fee: electricFee,
            water_fee: waterFee,
            service_fee: 0,
            total_amount: total,
            payment_status: 'unpaid',
            due_date: dueDate,
          });
          await syncInvoiceLineItems(invoice._id, monthKey, electricFee, waterFee);
          invoicesCreated++;
        }
      } catch (err) {
        // Keep a server-side trace for partial billing failures without failing unrelated groups.
        // eslint-disable-next-line no-console
        console.error(
          `[recalculate] Failed to process invoice for student ${studentId}, month ${monthKey}:`,
          err.message
        );
        groupHasFailure = true;
        continue;
      }
    }

    if (groupHasFailure) continue;

    await EWUsage.updateMany(
      { _id: { $in: records.map((record) => record._id) } },
      {
        $set: {
          occupied_beds: contractCount,
          is_billed: true,
        },
      }
    );

    await Promise.all(
      records.map((record) =>
        EWUsage.updateOne(
          { _id: record._id },
          {
            $set: {
              amount_per_bed: contractCount > 0 ? Math.round(record.amount / contractCount) : 0,
            },
          }
        )
      )
    );
  }

  return {
    invoicesCreated,
    invoicesUpdated,
    invoicesCancelled,
    totalStudents: studentsSeen.size,
    message: `Recalculation completed: ${invoicesCreated} new invoices, ${invoicesUpdated} updated, ${invoicesCancelled} cancelled, ${studentsSeen.size} students`,
  };
};

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
  const latestIds = await getLatestRecordIdsByKeys(docs);

  return {
    data: data.map((item) => ({
      ...item,
      is_latest_editable: latestIds.has(item.id),
    })),
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
  const recordDate = new Date(date);

  const block = await Block.findById(blockId).populate('dorm').lean();
  if (!block) throw new AppError(404, 'Block not found');
  if (isNaN(recordDate.getTime())) throw new AppError(400, 'Invalid date');

  await assertMonthNotOlderThanLatest(block._id, type, recordDate);
  const existingInMonth = await findRecordInMonth(block._id, type, recordDate);
  if (existingInMonth) {
    throw new AppError(
      400,
      `A ${type} usage record already exists for ${getMonthKey(recordDate)} in this block`
    );
  }

  // Automatically derive meter_left from the latest record for the same block and type
  const prevRecord = await EWUsage.findOne({ block: block._id, type }).sort({ date: -1 }).lean();
  const meter_left = prevRecord
    ? prevRecord.meter_right != null
      ? prevRecord.meter_right
      : prevRecord.meter_left
    : 0;

  const unit = type === 'electric' ? 'kW' : 'm3';
  const consumption = meter_right > meter_left ? meter_right - meter_left : 0;
  const occupied_beds = await countOccupiedBeds(block._id, recordDate);
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
    date: recordDate,
    term,
    unit,
  });

  await record.save();
  await processBillingGroups(getGroupsFromRecords([record]));
  return record.toJSON();
};

/**
 * Quickly create the next EW usage record for dev/testing purposes.
 * Reuses the normal create flow so billing and validations stay consistent.
 */
const quickCreateEWUsage = async (body) => {
  const { block: blockId, type, meter_right, date, term, meter_increment = 10 } = body;

  if (!blockId) throw new AppError(400, 'block is required');
  if (!type || !['electric', 'water'].includes(type)) {
    throw new AppError(400, 'type must be electric or water');
  }

  const latestRecord = await EWUsage.findOne({ block: blockId, type }).sort({ date: -1 }).lean();
  const nextDate = date ? new Date(date) : latestRecord ? getNextUsageDate(latestRecord.date) : new Date();
  if (isNaN(nextDate.getTime())) throw new AppError(400, 'Invalid date');

  const previousMeter = latestRecord
    ? latestRecord.meter_right != null
      ? latestRecord.meter_right
      : latestRecord.meter_left
    : 0;

  const nextMeterRight =
    meter_right !== undefined && meter_right !== null
      ? Number(meter_right)
      : previousMeter + Math.max(Number(meter_increment) || 0, 0);

  if (!Number.isFinite(nextMeterRight) || nextMeterRight < 0) {
    throw new AppError(400, 'meter_right must be a non-negative number');
  }

  return createEWUsage({
    block: blockId,
    type,
    meter_right: nextMeterRight,
    date: nextDate.toISOString(),
    term: term || deriveTermFromDate(nextDate),
  });
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
  const nextType = type !== undefined ? type : record.type;

  await assertMonthNotOlderThanLatest(record.block, nextType, record.date, record._id);
  const existingInMonth = await findRecordInMonth(record.block, nextType, record.date, record._id);
  if (existingInMonth) {
    throw new AppError(
      400,
      `A ${nextType} usage record already exists for ${getMonthKey(record.date)} in this block`
    );
  }

  if (meter_right !== undefined) record.meter_right = meter_right;
  if (term !== undefined) record.term = term;
  if (type !== undefined) {
    record.type = type;
    record.unit = type === 'electric' ? 'kW' : 'm3';
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
    ? prevRecord.meter_right != null
      ? prevRecord.meter_right
      : prevRecord.meter_left
    : 0;
  record.meter_left = old_meter;
  record.consumption = record.meter_right > old_meter ? record.meter_right - old_meter : 0;

  const pricePerUnit = getPricePerUnit(record.type);
  record.price_per_unit = pricePerUnit;
  record.amount = record.consumption > 0 ? record.consumption * pricePerUnit : 0;
  const occupied_beds = await countOccupiedBeds(record.block, record.date);
  record.occupied_beds = occupied_beds;
  record.amount_per_bed = occupied_beds > 0 ? Math.round(record.amount / occupied_beds) : 0;
  // Reset is_billed so next recalculation picks it up
  record.is_billed = false;

  await record.save({ validateBeforeSave: false });
  await processBillingGroups(getGroupsFromRecords([record]));
  return record.toJSON();
};

/**
 * Reset meter - replace physical meter with a new one.
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
  await processBillingGroups(getGroupsFromRecords([record]));
  return record.toJSON();
};

/**
 * Count occupied beds in a block
 */
const countOccupiedBeds = async (blockId, billingDate = new Date()) => {
  const contracts = await getBillingContracts(blockId, billingDate);
  return contracts.length;
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
  const affectedRecords = [];

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

      if (!dateRaw) validationErrors.push('Date (column D) is required');

      if (meterRaw === undefined || meterRaw === null || meterRaw === '')
        validationErrors.push('Meter (column E) is required');
      else if (isNaN(Number(meterRaw)) || Number(meterRaw) < 0)
        validationErrors.push('Meter (column E) must be a non-negative number');

      if (!termRaw || String(termRaw).trim() === '')
        validationErrors.push('Term (column F) is required');

      if (validationErrors.length > 0) throw new Error(validationErrors.join('; '));

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
        const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (dmyMatch) {
          parsedDate = new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
        } else {
          parsedDate = new Date(str);
        }
      }
      if (isNaN(parsedDate.getTime())) throw new Error('Date (column D) is invalid');

      if (Date.now() - parsedDate.getTime() > TWO_YEARS_MS)
        throw new Error(
          `Date (column D) is too far in the past (${parsedDate.toLocaleDateString('en-US')})`
        );

      // ── 3. Detect duplicates within the same file (block + type + month) ──
      const monthKey = getMonthKey(parsedDate);
      const fileKey = `${String(dormCode).trim().toUpperCase()}|${String(blockCode).trim().toUpperCase()}|${type}|${monthKey}`;
      if (seenInFile.has(fileKey)) {
        duplicateInFile++;
        errors.push({
          row: i + 1,
          block: blockCode,
          error: `Duplicate in file: block ${blockCode}, type ${type === 'electric' ? 'Electric' : 'Water'}, month ${monthKey} appears multiple times`,
        });
        continue;
      }
      seenInFile.add(fileKey);

      // ── 4. Find block in DB (filter by dorm_code + block_code) ──
      const dormDoc = await Dorm.findOne({
        dorm_code: String(dormCode).trim().toUpperCase(),
      }).lean();
      if (!dormDoc) throw new Error(`Dorm not found: ${dormCode}`);

      const block = await Block.findOne({
        block_code: String(blockCode).trim(),
        dorm: dormDoc._id,
      }).populate('dorm');
      if (!block)
        throw new Error(`Block not found in the system: dorm=${dormCode}, block=${blockCode}`);

      // ── 5. Detect duplicates in the database (same block + type + month) ──
      const existingInMonth = await findRecordInMonth(block._id, type, parsedDate);

      await assertMonthNotOlderThanLatest(
        block._id,
        type,
        parsedDate,
        existingInMonth ? existingInMonth._id : null
      );

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
      const unit = type === 'electric' ? 'kW' : 'm3';
      const occupied_beds = await countOccupiedBeds(block._id, parsedDate);

      // Find the latest record for the block + type to determine the previous meter
      const prevQuery = { block: block._id, type };
      if (existingInMonth) prevQuery._id = { $ne: existingInMonth._id };
      const prevRecord = await EWUsage.findOne(prevQuery).sort({ date: -1 }).lean();
      const old_meter = prevRecord
        ? prevRecord.meter_right != null
          ? prevRecord.meter_right
          : prevRecord.meter_left
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
        affectedRecords.push(existingInMonth);
        created++;
        continue;
      }

      const createdRecord = await EWUsage.create({
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
      affectedRecords.push(createdRecord);
      created++;
    } catch (err) {
      failed++;
      errors.push({ row: i + 1, block: blockCode, error: err.message });
    }
  }

  const billing =
    affectedRecords.length > 0
      ? await processBillingGroups(getGroupsFromRecords(affectedRecords))
      : null;

  return { created, duplicateInFile, duplicateInDB, failed, warnings, errors, billing };
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

  const sheetData = records.map((r, index) => ({
    '#': index + 1,
    'Block Name': r.block_name,
    'Usage Type': r.type === 'electric' ? 'Electric' : 'Water',
    'Created Date': r.date ? new Date(r.date).toLocaleDateString('en-US') : '',
    Term: r.term,
    'Meter Left': r.meter_left,
    'Meter Right': r.meter_right,
    Consumption: r.consumption,
    Unit: r.unit,
    'Price Per Unit': r.price_per_unit,
    Amount: r.amount,
    Billed: r.is_billed ? 'Yes' : 'No',
  }));

  const ws = xlsx.utils.json_to_sheet(sheetData);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'EW Usages');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * Get EW usages for the student's current block (student-facing)
 * Looks up student's active contract -> room -> block -> EWUsage records
 */
const getMyEWUsages = async (userId) => {
  const { Contract, Student } = require('../models');

  const student = await Student.findOne({ user: userId }).lean();
  if (!student) throw new AppError(404, 'Student profile not found');

  // Find active contract to get current room (includes extended contracts)
  const contract = await Contract.findOne({
    student: student._id,
    status: { $in: ['active', 'extended'] },
  })
    .populate('room')
    .lean();

  if (!contract || !contract.room) {
    return { block_name: null, data: [], message: 'No active room assignment found' };
  }

  const room = contract.room;

  // Get block name from Block document (reliable even when no EW records exist)
  const blockDoc = await Block.findById(room.block).lean();
  const blockName = blockDoc?.block_name || blockDoc?.block_code || null;

  const records = await EWUsage.find({
    block: room.block,
    consumption: { $gt: 0 },
  })
    .sort({ date: -1 })
    .lean();

  const blockRooms = await Room.find({ block: room.block }, '_id').lean();
  const blockRoomIds = blockRooms.map((blockRoom) => blockRoom._id);
  const recordDatesByMonth = new Map(
    records.map((record) => [getMonthKey(record.date), record.date])
  );
  const occupancyEntries = await Promise.all(
    Array.from(recordDatesByMonth.entries()).map(async ([monthKey, date]) => [
      monthKey,
      await countOccupiedBeds(room.block, date),
    ])
  );
  const occupancyByMonth = new Map(occupancyEntries);
  const invoiceMonths = [...recordDatesByMonth.keys()];
  const invoices = invoiceMonths.length
    ? await Invoice.find({
        student: student._id,
        invoice_code: { $regex: /^EW-/ },
        invoice_month: { $in: invoiceMonths },
        room: { $in: blockRoomIds },
      })
        .select('invoice_month electricity_fee water_fee payment_status')
        .sort({ createdAt: -1 })
        .lean()
    : [];
  const invoiceByMonth = new Map();
  invoices.forEach((invoice) => {
    if (invoice.payment_status === 'cancelled') return;
    const current = invoiceByMonth.get(invoice.invoice_month) || {
      electricity_fee: 0,
      water_fee: 0,
    };
    invoiceByMonth.set(invoice.invoice_month, {
      electricity_fee: current.electricity_fee + (invoice.electricity_fee || 0),
      water_fee: current.water_fee + (invoice.water_fee || 0),
    });
  });

  return {
    block_name: blockName,
    room_number: room.room_number,
    data: records.map((r) => {
      const monthKey = getMonthKey(r.date);
      const invoice = invoiceByMonth.get(monthKey);
      const exactShare = invoice
        ? r.type === 'electric'
          ? invoice.electricity_fee
          : invoice.water_fee
        : null;
      const monthOccupiedBeds = occupancyByMonth.get(monthKey) || 0;
      const fallbackOccupiedBeds = r.occupied_beds > 0 ? r.occupied_beds : monthOccupiedBeds;
      const derivedOccupiedBeds =
        typeof exactShare === 'number' && exactShare > 0
          ? deriveOccupiedBedsFromShare(r.amount, exactShare)
          : 0;

      return {
        id: r._id,
        term: r.term,
        date: r.date,
        type: r.type,
        meter_left: r.meter_left,
        meter_right: r.meter_right,
        consumption: r.consumption,
        unit: r.unit,
        price_per_unit: r.price_per_unit,
        occupied_beds: derivedOccupiedBeds || fallbackOccupiedBeds || 0,
        total_amount: r.amount,
        amount:
          typeof exactShare === 'number'
            ? exactShare
            : fallbackOccupiedBeds > 0
              ? Math.round(r.amount / fallbackOccupiedBeds)
              : r.amount_per_bed || 0,
      };
    }),
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
  const unbilledRecords = await EWUsage.find({ is_billed: false }).lean();

  if (unbilledRecords.length === 0) {
    return processBillingGroups([]);
  }

  return processBillingGroups(getGroupsFromRecords(unbilledRecords));
};

module.exports = {
  getEWUsages,
  createEWUsage,
  quickCreateEWUsage,
  updateEWUsage,
  resetMeter,
  importEWUsages,
  exportEWUsages,
  recalculate,
  getMyEWUsages,
};
