const xlsx = require('xlsx');
const AppError = require('../utils/AppError');
const { EWUsage, Block, Room, Dorm, Invoice, InvoiceLineItem, Contract, Student } = require('../models');
const {
  DORM_TIMEZONE,
  getDateCodeInDormTimezone,
  getDatePartsInDormTimezone,
  getDormDayRange,
  getEndOfDayInDormTimezone,
  getMonthKeyInDormTimezone,
  getMonthRangeInDormTimezone,
  getStartOfDayInDormTimezone,
  normalizeDateOnlyPartsToDormNoonUtc,
  normalizeStrictDateOnlyPartsToDormNoonUtc,
  normalizeDateOnlyToDormNoonUtc,
} = require('../utils/dateOnly');

const PRICE_MAP = { electric: 3000, water: 9000 };
const EW_INVOICE_REGEX = /^EW-/;

const getPricePerUnit = (type) => PRICE_MAP[type] || 3000;
const emitInvoiceRealtime = async (io, invoice, action = 'updated') => {
  if (!io || !invoice) return;
  const invoiceId = String(invoice._id || invoice.id);
  const studentId = String(invoice.student);
  const student = await Student.findById(studentId).select('user').lean().catch(() => null);
  const payload = {
    action,
    invoiceId,
    invoice_code: invoice.invoice_code,
    payment_status: invoice.payment_status,
    total_amount: invoice.total_amount,
    invoice_month: invoice.invoice_month,
    student: studentId,
    room: invoice.room ? String(invoice.room) : null,
  };
  io.to('managers').emit('invoice_updated', payload);
  if (student?.user) io.to(`user_${student.user}`).emit('invoice_updated', payload);
};

const deriveTermFromDate = (date) => {
  const { month, year } = getDatePartsInDormTimezone(date);
  if (month <= 4) return `Spring-${year}`;
  if (month <= 8) return `Summer-${year}`;
  return `Fall-${year}`;
};

const normalizeRecordDate = (value) => {
  return normalizeDateOnlyToDormNoonUtc(value);
};

const getNextUsageDate = (date) => {
  const parts = getDatePartsInDormTimezone(date);
  if (!parts) return new Date(NaN);

  return normalizeDateOnlyPartsToDormNoonUtc(parts.year, parts.month + 2, 0);
};

const getMonthKey = (date) => getMonthKeyInDormTimezone(date);

const getDayBounds = (date) => getDormDayRange(date);

const addDays = (date, days) => {
  const parts = getDatePartsInDormTimezone(date);
  if (!parts) return new Date(NaN);

  return normalizeDateOnlyPartsToDormNoonUtc(parts.year, parts.month, parts.day + days);
};

const getBillingIntervalBounds = (currentDate, previousDate = null) => {
  const current = normalizeRecordDate(currentDate);

  if (!previousDate) {
    const parts = getDatePartsInDormTimezone(current);
    return {
      start: normalizeDateOnlyPartsToDormNoonUtc(parts.year, parts.month, 1),
      end: current,
    };
  }

  const previous = normalizeRecordDate(previousDate);
  const previousParts = getDatePartsInDormTimezone(previous);
  return {
    start: normalizeDateOnlyPartsToDormNoonUtc(
      previousParts.year,
      previousParts.month,
      previousParts.day + 1
    ),
    end: current,
  };
};

const getInclusiveDayCount = (start, end) => {
  const startDay = getStartOfDayInDormTimezone(start);
  const endDay = getStartOfDayInDormTimezone(end);
  const diff = endDay.getTime() - startDay.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
};

const getGroupKey = (blockId, date) => `${blockId.toString()}_${getMonthKey(date)}`;

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

const findRecordOnSameDate = async (blockId, type, date, excludeId = null) => {
  const { start, end } = getDayBounds(date);
  const query = { block: blockId, type, date: { $gte: start, $lte: end } };
  if (excludeId) query._id = { $ne: excludeId };
  return EWUsage.findOne(query);
};

const getMonthDistance = (fromDate, toDate) =>
  (() => {
    const from = getDatePartsInDormTimezone(fromDate);
    const to = getDatePartsInDormTimezone(toDate);
    return (to.year - from.year) * 12 + (to.month - from.month);
  })();

const isBillingClosingDay = (date) => {
  const parts = getDatePartsInDormTimezone(date);
  const lastDay = normalizeDateOnlyPartsToDormNoonUtc(parts.year, parts.month + 1, 0);
  const actualLastDay = getDatePartsInDormTimezone(lastDay).day;
  const closingDay = actualLastDay > 30 ? 30 : actualLastDay;
  return parts.day === closingDay;
};

const formatDateDMY = (date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: DORM_TIMEZONE }).format(new Date(date));
const formatMonthYear = (date) =>
  new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: DORM_TIMEZONE,
  }).format(new Date(date));
const assertNotFutureDate = (date, label = 'Date') => {
  const currentDayEnd = getEndOfDayInDormTimezone();
  if (new Date(date).getTime() > currentDayEnd.getTime()) {
    throw new AppError(`${label} cannot be in the future`, 400);
  }
};
const buildStrictDate = (year, month, day) => {
  const parsed = normalizeStrictDateOnlyPartsToDormNoonUtc(year, month, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const applyMonthYearDateFilter = (query, month, year) => {
  if (month && year) {
    const { start, end } = getMonthRangeInDormTimezone(parseInt(year, 10), parseInt(month, 10));
    query.date = { $gte: start, $lte: end };
    return;
  }

  if (year) {
    const { start } = getMonthRangeInDormTimezone(parseInt(year, 10), 1);
    const { end } = getMonthRangeInDormTimezone(parseInt(year, 10), 12);
    query.date = { $gte: start, $lte: end };
    return;
  }

  if (month) {
    query.$expr = { $eq: [{ $month: '$date' }, parseInt(month, 10)] };
  }
};

const assertDateFollowsLatestRecord = async (blockId, type, date, excludeId = null) => {
  const query = { block: blockId, type };
  if (excludeId) query._id = { $ne: excludeId };

  const latestRecord = await EWUsage.findOne(query).sort({ date: -1, createdAt: -1 }).lean();
  if (!latestRecord) return;

  const latestDate = new Date(latestRecord.date);
  const nextDate = new Date(date);
  const monthDistance = getMonthDistance(latestDate, nextDate);

  if (monthDistance < 0) {
    throw new AppError(
      `Cannot create or import ${type} usage in an earlier month than the latest record (${formatDateDMY(latestDate)})`,
      400
    );
  }

  if (monthDistance === 0 && isBillingClosingDay(latestDate)) {
    throw new AppError(
      `${type === 'electric' ? 'Electric' : 'Water'} usage for ${formatMonthYear(latestDate)} has already been finalized with an end-of-month record`,
      400
    );
  }

  if (monthDistance === 0 && nextDate.getTime() <= latestDate.getTime()) {
    throw new AppError(
      `New ${type} usage in the same month must be later than the latest record (${formatDateDMY(latestDate)})`,
      400
    );
  }

  if (monthDistance === 1 && !isBillingClosingDay(latestDate)) {
    throw new AppError(
      `Cannot create or import ${type} usage for a new month until ${formatMonthYear(latestDate)} has an end-of-month record`,
      400
    );
  }

  if (monthDistance > 1) {
    const latestParts = getDatePartsInDormTimezone(latestDate);
    const nextAllowedMonth = normalizeDateOnlyPartsToDormNoonUtc(
      latestParts.year,
      latestParts.month + 1,
      1
    );
    throw new AppError(
      `Cannot skip months when creating ${type} usage. The next allowed month after ${formatDateDMY(latestDate)} is ${formatMonthYear(nextAllowedMonth)}`,
      400
    );
  }
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

const getGroupsFromRecords = (records) => {
  const groups = new Map();
  records.forEach((record) => {
    const key = getGroupKey(record.block, record.date);
    if (!groups.has(key)) {
      groups.set(key, { blockId: record.block.toString(), monthKey: getMonthKey(record.date) });
    }
  });
  return Array.from(groups.values());
};

const getRecordsForGroup = async (blockId, monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  const { start, end } = getMonthRangeInDormTimezone(year, month);
  return EWUsage.find({
    block: blockId,
    date: { $gte: start, $lte: end },
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();
};

const generateEWInvoiceCode = async () => {
  const dateStr = getDateCodeInDormTimezone();
  const prefix = `EW-${dateStr}-`;
  const lastInvoice = await Invoice.findOne({ invoice_code: { $regex: `^${prefix}` } }).sort({
    invoice_code: -1,
  });
  let seq = 1;
  if (lastInvoice) {
    const lastSeq = parseInt(lastInvoice.invoice_code.split('-').pop(), 10);
    seq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

const syncInvoiceLineItems = async (invoiceId, monthKey, electricFee, waterFee) => {
  await InvoiceLineItem.deleteMany({ invoice: invoiceId });
  const lineItems = buildEWLineItems(invoiceId, monthKey, electricFee, waterFee);
  if (lineItems.length) await InvoiceLineItem.insertMany(lineItems);
};

const getContractEffectiveEnd = (contract) =>
  contract.terminated_at ? new Date(contract.terminated_at) : new Date(contract.end_date);

const getContractPriority = (contract) => {
  const status = contract.status || '';
  if (status === 'active' || status === 'extended') return 4;
  if (status === 'upcoming') return 3;
  if (status === 'terminated') return 2;
  if (status === 'expired') return 1;
  return 0;
};

const dedupeContracts = (contracts) => {
  const unique = new Map();

  contracts.forEach((contract) => {
    const key = [
      contract.student?.toString?.() || String(contract.student),
      contract.room?._id?.toString?.() || contract.room?.toString?.() || String(contract.room),
      contract.bed?.toString?.() || String(contract.bed),
      new Date(contract.start_date).toISOString(),
      new Date(contract.end_date).toISOString(),
    ].join('|');

    const current = unique.get(key);
    if (!current) {
      unique.set(key, contract);
      return;
    }

    const currentPriority = getContractPriority(current);
    const nextPriority = getContractPriority(contract);

    if (nextPriority > currentPriority) {
      unique.set(key, contract);
      return;
    }

    if (nextPriority === currentPriority) {
      const currentUpdatedAt = new Date(current.updatedAt || current.createdAt || 0).getTime();
      const nextUpdatedAt = new Date(contract.updatedAt || contract.createdAt || 0).getTime();
      if (nextUpdatedAt >= currentUpdatedAt) unique.set(key, contract);
    }
  });

  return [...unique.values()];
};

const getContractsForBlock = async (blockId, { populateRoom = false } = {}) => {
  const roomDocs = await Room.find({ block: blockId }, populateRoom ? '_id room_number' : '_id').lean();
  if (!roomDocs.length) return [];

  const roomIds = roomDocs.map((room) => room._id);
  const roomById = new Map(roomDocs.map((room) => [room._id.toString(), room]));

  let query = Contract.find({
      room: { $in: roomIds },
      status: { $in: ['active', 'extended', 'terminated', 'expired'] },
    }).select('student room bed start_date end_date terminated_at status createdAt updatedAt');

  if (populateRoom) query = query.populate('room', 'room_number');

  const contracts = await query.lean();
  return dedupeContracts(contracts).map((contract) => ({
      ...contract,
      room: populateRoom
        ? contract.room
      : roomById.get(contract.room.toString()) || { _id: contract.room },
  }));
};

const contractActiveOnSnapshotDate = (contract, snapshotDate) => {
  const occupancyStart = new Date(contract.start_date);
  const occupancyEnd = getContractEffectiveEnd(contract);
  const { start: snapshotStart, end: snapshotEnd } = getDormDayRange(snapshotDate);
  return occupancyStart <= snapshotEnd && occupancyEnd >= snapshotStart;
};

const pickCanonicalStudentContractAtSnapshot = (current, next) => {
  if (!current) return next;
  if (!next) return current;

  const currentPriority = getContractPriority(current);
  const nextPriority = getContractPriority(next);
  if (nextPriority > currentPriority) return next;
  if (nextPriority < currentPriority) return current;

  const currentStart = new Date(current.start_date || 0).getTime();
  const nextStart = new Date(next.start_date || 0).getTime();
  if (nextStart > currentStart) return next;
  if (nextStart < currentStart) return current;

  const currentUpdatedAt = new Date(current.updatedAt || current.createdAt || 0).getTime();
  const nextUpdatedAt = new Date(next.updatedAt || next.createdAt || 0).getTime();
  if (nextUpdatedAt >= currentUpdatedAt) return next;
  return current;
};

const dedupeContractsByStudentAtSnapshot = (contracts) => {
  const byStudent = new Map();

  contracts.forEach((contract) => {
    const studentId = contract.student?.toString?.() || String(contract.student);
    const current = byStudent.get(studentId);
    byStudent.set(studentId, pickCanonicalStudentContractAtSnapshot(current, contract));
  });

  return [...byStudent.values()];
};

const sortContractsForAllocation = (contracts) =>
  [...contracts].sort((left, right) => left.student.toString().localeCompare(right.student.toString()));

const getActiveContractsAtDate = (contracts, snapshotDate) =>
  sortContractsForAllocation(
    dedupeContractsByStudentAtSnapshot(
      contracts.filter((contract) => contractActiveOnSnapshotDate(contract, snapshotDate))
    )
  );

const allocateAmountToContracts = (totalAmount, contracts) => {
  const allocations = new Map();
  if (!contracts.length || totalAmount <= 0) return allocations;

  const ordered = sortContractsForAllocation(contracts);
  const base = Math.floor(totalAmount / ordered.length);
  let assigned = 0;

  ordered.forEach((contract, index) => {
    const isLast = index === ordered.length - 1;
    const share = isLast ? totalAmount - assigned : base;
    assigned += share;
    allocations.set(contract.student.toString(), {
      studentId: contract.student.toString(),
      roomId: contract.room?._id ? contract.room._id.toString() : contract.room.toString(),
      share,
    });
  });

  return allocations;
};

const allocateAmountByWeights = (totalAmount, weightedEntries) => {
  const allocations = new Map();
  const normalizedEntries = weightedEntries
    .filter((entry) => Number(entry.weight || 0) > 0)
    .map((entry) => ({
      studentId: entry.studentId,
      roomId: entry.roomId,
      weight: Number(entry.weight),
    }));

  if (!normalizedEntries.length || totalAmount <= 0) return allocations;

  const totalWeight = normalizedEntries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return allocations;

  const ordered = [...normalizedEntries].sort((left, right) =>
    String(left.studentId).localeCompare(String(right.studentId))
  );

  let assigned = 0;
  const computed = ordered.map((entry) => {
    const rawShare = (totalAmount * entry.weight) / totalWeight;
    const baseShare = Math.floor(rawShare);
    assigned += baseShare;
    return {
      ...entry,
      share: baseShare,
      fraction: rawShare - baseShare,
    };
  });

  let remainder = totalAmount - assigned;
  if (remainder > 0) {
    computed
      .sort((left, right) => {
        if (right.fraction !== left.fraction) return right.fraction - left.fraction;
        return String(left.studentId).localeCompare(String(right.studentId));
      })
      .forEach((entry) => {
        if (remainder <= 0) return;
        entry.share += 1;
        remainder -= 1;
      });
  }

  computed.forEach((entry) => {
    allocations.set(String(entry.studentId), {
      studentId: String(entry.studentId),
      roomId: entry.roomId,
      share: entry.share,
      weight: entry.weight,
    });
  });

  return allocations;
};

const buildIntervalOccupancyAllocation = (contracts, startDate, endDate, totalAmount) => {
  const allocationsByStudent = new Map();
  const dailyOccupiedCounts = [];

  for (
    let cursor = normalizeRecordDate(startDate);
    cursor <= endDate;
    cursor = addDays(cursor, 1)
  ) {
    const activeContracts = getActiveContractsAtDate(contracts, cursor);
    dailyOccupiedCounts.push(activeContracts.length);

    activeContracts.forEach((contract) => {
      const studentId = contract.student.toString();
      const current = allocationsByStudent.get(studentId) || {
        studentId,
        roomId: contract.room?._id ? contract.room._id.toString() : contract.room.toString(),
        weight: 0,
      };
      current.roomId =
        contract.room?._id ? contract.room._id.toString() : contract.room.toString();
      current.weight += 1;
      allocationsByStudent.set(studentId, current);
    });
  }

  const weightedAllocations = allocateAmountByWeights(
    totalAmount,
    Array.from(allocationsByStudent.values())
  );

  const totalOccupiedBedDays = dailyOccupiedCounts.reduce((sum, count) => sum + count, 0);
  const intervalDays = dailyOccupiedCounts.length;
  const averageOccupiedBeds =
    intervalDays > 0 ? Math.round(totalOccupiedBedDays / intervalDays) : 0;

  return {
    allocations: weightedAllocations,
    averageOccupiedBeds,
    totalOccupiedBedDays,
    intervalDays,
  };
};

const getTypeChainsForGroup = async (blockId, monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  const { end: monthEnd } = getMonthRangeInDormTimezone(year, month);
  const [electric, water] = await Promise.all(
    ['electric', 'water'].map((type) =>
      EWUsage.find({ block: blockId, type, date: { $lte: monthEnd } })
        .sort({ date: 1, createdAt: 1 })
        .lean()
    )
  );
  return { electric, water };
};

const buildGroupComputation = async (blockId, monthKey) => {
  const [records, contracts, typeChains] = await Promise.all([
    getRecordsForGroup(blockId, monthKey),
    getContractsForBlock(blockId, { populateRoom: true }),
    getTypeChainsForGroup(blockId, monthKey),
  ]);

  const recordSummaries = [];
  const studentMonthShares = new Map();
  const perRecordStudentShare = new Map();

  if (!records.length) return { records, recordSummaries, studentMonthShares, perRecordStudentShare };

  for (const type of ['electric', 'water']) {
    const chain = typeChains[type];
    chain.forEach((record, index) => {
      if (getMonthKey(record.date) !== monthKey) return;

      const previousRecord = index > 0 ? chain[index - 1] : null;
      const { start, end } = getBillingIntervalBounds(record.date, previousRecord?.date || null);
      const intervalAllocation = buildIntervalOccupancyAllocation(
        contracts,
        start,
        end,
        Number(record.amount || 0)
      );
      const occupiedBeds = intervalAllocation.averageOccupiedBeds;
      const amountPerBed =
        occupiedBeds > 0 && record.amount > 0 ? Math.round(record.amount / occupiedBeds) : 0;
      const billingStudents = intervalAllocation.allocations.size;

      recordSummaries.push({
        recordId: record._id.toString(),
        occupiedBeds,
        amountPerBed,
        billingStudents,
        totalStudentDays: intervalAllocation.totalOccupiedBedDays,
        intervalDays: intervalAllocation.intervalDays,
      });

      intervalAllocation.allocations.forEach((allocation) => {
        const current = studentMonthShares.get(allocation.studentId) || {
          studentId: allocation.studentId,
          roomId: allocation.roomId,
          electricityFee: 0,
          waterFee: 0,
        };
        current.roomId = allocation.roomId || current.roomId;
        if (type === 'electric') current.electricityFee += allocation.share;
        else current.waterFee += allocation.share;
        studentMonthShares.set(allocation.studentId, current);
        perRecordStudentShare.set(`${record._id.toString()}_${allocation.studentId}`, {
          share: allocation.share,
          studentDays: allocation.weight,
          billingStudents,
          totalStudentDays: intervalAllocation.totalOccupiedBedDays,
          intervalDays: intervalAllocation.intervalDays,
        });
      });
    });
  }

  return { records, recordSummaries, studentMonthShares, perRecordStudentShare };
};

const updateRecordSummaries = async (recordSummaries) => {
  if (!recordSummaries.length) return;
  await Promise.all(
    recordSummaries.map((summary) =>
      EWUsage.updateOne(
        { _id: summary.recordId },
        { $set: { occupied_beds: summary.occupiedBeds, amount_per_bed: summary.amountPerBed } }
      )
    )
  );
};

const markGroupsBilled = async (groups, billed) => {
  if (!groups.length) return;
  await Promise.all(
    groups.map(async ({ blockId, monthKey }) => {
      const records = await getRecordsForGroup(blockId, monthKey);
      if (!records.length) return;
      await EWUsage.updateMany(
        { _id: { $in: records.map((record) => record._id) } },
        { $set: { is_billed: billed } }
      );
    })
  );
};

const collectGroupsFromFilters = async (filters = {}, { onlyUnbilled = false } = {}) => {
  const query = {};
  if (filters.block) query.block = filters.block;
  if (onlyUnbilled) query.is_billed = false;
  applyMonthYearDateFilter(query, filters.month, filters.year);
  const records = await EWUsage.find(query).select('_id block date').lean();
  return getGroupsFromRecords(records);
};

const recalculateGroups = async (groups) => {
  if (!groups.length) {
    return {
      recordsCalculated: 0,
      groupsProcessed: 0,
      totalStudents: 0,
      message: 'No EW records to recalculate',
    };
  }

  const studentsSeen = new Set();
  let recordsCalculated = 0;

  for (const group of groups) {
    const computation = await buildGroupComputation(group.blockId, group.monthKey);
    await updateRecordSummaries(computation.recordSummaries);
    recordsCalculated += computation.recordSummaries.length;
    computation.studentMonthShares.forEach((_, studentId) => studentsSeen.add(studentId));
  }

  return {
    recordsCalculated,
    groupsProcessed: groups.length,
    totalStudents: studentsSeen.size,
    message: `Recalculated ${recordsCalculated} record(s) across ${groups.length} month group(s). ${studentsSeen.size} unique student(s) were affected across the recalculated month(s).`,
  };
};

const getEWInvoiceQuery = (studentId, monthKey) => ({
  student: studentId,
  invoice_month: monthKey,
  invoice_code: { $regex: EW_INVOICE_REGEX },
});

const buildGroupIdentifier = (blockId, monthKey) => `${blockId.toString()}_${monthKey}`;

const createInvoicesForGroups = async (
  groups,
  { studentId = null, roomId = null, dueDate: overrideDueDate = null, io = null } = {}
) => {
  if (!groups.length) {
    return {
      invoicesCreated: 0,
      invoicesUpdated: 0,
      invoicesCancelled: 0,
      totalStudents: 0,
      message: 'No EW invoice groups to process',
    };
  }

  const dueDate = normalizeDateOnlyToDormNoonUtc(
    overrideDueDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  );
  if (Number.isNaN(dueDate.getTime())) {
    throw new AppError('due_date is invalid', 400);
  }
  const studentsSeen = new Set();
  let invoicesCreated = 0;
  let invoicesUpdated = 0;
  let invoicesCancelled = 0;
  let skippedConflicts = 0;
  const groupMeta = new Map();
  const aggregatedPlans = new Map();
  const scopeRoomIds = new Set();

  for (const group of groups) {
    const groupKey = buildGroupIdentifier(group.blockId, group.monthKey);
    const computation = await buildGroupComputation(group.blockId, group.monthKey);
    await updateRecordSummaries(computation.recordSummaries);

    const studentPlans = Array.from(computation.studentMonthShares.values())
      .filter((plan) => !studentId || plan.studentId === studentId)
      .filter((plan) => !roomId || plan.roomId?.toString() === roomId.toString())
      .map((plan) => ({ ...plan, totalAmount: plan.electricityFee + plan.waterFee }));

    const expectedInvoiceStudentIds = new Set(
      studentPlans.filter((plan) => plan.totalAmount > 0).map((plan) => plan.studentId)
    );

    const groupTotalAmount = computation.records.reduce(
      (sum, record) => sum + Number(record.amount || 0),
      0
    );

    groupMeta.set(groupKey, {
      group,
      expectedInvoiceStudentIds,
      processedStudentIds: new Set(),
      conflict: false,
      groupTotalAmount,
    });

    studentPlans.forEach((plan) => {
      if (plan.roomId) scopeRoomIds.add(plan.roomId.toString());
      const current = aggregatedPlans.get(plan.studentId) || {
        studentId: plan.studentId,
        roomId: plan.roomId,
        electricityFee: 0,
        waterFee: 0,
        totalAmount: 0,
        groupKeys: new Set(),
      };
      current.roomId = plan.roomId || current.roomId;
      current.electricityFee += Number(plan.electricityFee || 0);
      current.waterFee += Number(plan.waterFee || 0);
      current.totalAmount += Number(plan.totalAmount || 0);
      current.groupKeys.add(groupKey);
      aggregatedPlans.set(plan.studentId, current);
    });
  }

  for (const plan of aggregatedPlans.values()) {
    studentsSeen.add(plan.studentId);

    const existingInvoices = await Invoice.find(
      getEWInvoiceQuery(plan.studentId, groups[0].monthKey)
    )
      .sort({ createdAt: -1 })
      .lean();

    const canonical = existingInvoices[0] || null;
    const extras = canonical
      ? existingInvoices.filter((invoice) => invoice._id.toString() !== canonical._id.toString())
      : [];

    if (extras.some((invoice) => invoice.payment_status === 'paid')) {
      skippedConflicts++;
      plan.groupKeys.forEach((groupKey) => {
        const meta = groupMeta.get(groupKey);
        if (meta) meta.conflict = true;
      });
      continue;
    }

    if (extras.length) {
      await Promise.all(
        extras.map(async (invoice) => {
          await InvoiceLineItem.deleteMany({ invoice: invoice._id });
          await Invoice.deleteOne({ _id: invoice._id });
          await emitInvoiceRealtime(io, invoice, 'deleted');
        })
      );
      invoicesCancelled += extras.length;
    }

    if (canonical && canonical.payment_status === 'paid') {
      if (
        canonical.total_amount !== plan.totalAmount ||
        canonical.electricity_fee !== plan.electricityFee ||
        canonical.water_fee !== plan.waterFee
      ) {
        skippedConflicts++;
        plan.groupKeys.forEach((groupKey) => {
          const meta = groupMeta.get(groupKey);
          if (meta) meta.conflict = true;
        });
        continue;
      }

      plan.groupKeys.forEach((groupKey) => {
        const meta = groupMeta.get(groupKey);
        if (meta) meta.processedStudentIds.add(plan.studentId);
      });
      continue;
    }

    if (canonical) {
      const invoice = await Invoice.findById(canonical._id);
      if (!invoice) throw new AppError('Invoice not found during EW invoice creation', 404);

      if (plan.totalAmount <= 0) {
        const deletedSnapshot = invoice.toObject();
        await InvoiceLineItem.deleteMany({ invoice: invoice._id });
        await invoice.deleteOne();
        await emitInvoiceRealtime(io, deletedSnapshot, 'deleted');
        invoicesCancelled++;
      } else {
        invoice.room = plan.roomId;
        invoice.electricity_fee = plan.electricityFee;
        invoice.water_fee = plan.waterFee;
        invoice.total_amount = plan.totalAmount;
        invoice.due_date = dueDate;
        await invoice.save();
        await syncInvoiceLineItems(invoice._id, groups[0].monthKey, plan.electricityFee, plan.waterFee);
        await emitInvoiceRealtime(io, invoice, 'updated');
        invoicesUpdated++;
      }

      plan.groupKeys.forEach((groupKey) => {
        const meta = groupMeta.get(groupKey);
        if (meta) meta.processedStudentIds.add(plan.studentId);
      });
      continue;
    }

    if (plan.totalAmount <= 0) continue;

    const invoice = await Invoice.create({
      invoice_code: await generateEWInvoiceCode(),
      student: plan.studentId,
      room: plan.roomId,
      invoice_month: groups[0].monthKey,
      room_fee: 0,
      electricity_fee: plan.electricityFee,
      water_fee: plan.waterFee,
      service_fee: 0,
      total_amount: plan.totalAmount,
      payment_status: 'unpaid',
      due_date: dueDate,
    });
    await syncInvoiceLineItems(invoice._id, groups[0].monthKey, plan.electricityFee, plan.waterFee);
    await emitInvoiceRealtime(io, invoice, 'created');
    invoicesCreated++;
    plan.groupKeys.forEach((groupKey) => {
      const meta = groupMeta.get(groupKey);
      if (meta) meta.processedStudentIds.add(plan.studentId);
    });
  }

  if (!studentId && !roomId && scopeRoomIds.size) {
    const existingScopedInvoices = await Invoice.find({
      room: { $in: [...scopeRoomIds] },
      invoice_month: groups[0].monthKey,
      invoice_code: { $regex: EW_INVOICE_REGEX },
    })
      .sort({ createdAt: -1 })
      .lean();

    const expectedStudentIds = new Set(
      [...aggregatedPlans.values()]
        .filter((plan) => plan.totalAmount > 0)
        .map((plan) => plan.studentId.toString())
    );

    const staleInvoices = existingScopedInvoices.filter(
      (invoice) =>
        !expectedStudentIds.has(invoice.student.toString()) && invoice.payment_status !== 'paid'
    );

    if (staleInvoices.length) {
      await Promise.all(
        staleInvoices.map(async (invoice) => {
          await InvoiceLineItem.deleteMany({ invoice: invoice._id });
          await Invoice.deleteOne({ _id: invoice._id });
          await emitInvoiceRealtime(io, invoice, 'deleted');
        })
      );
      invoicesCancelled += staleInvoices.length;
    }
  }

  const groupsReadyToMarkBilled = [];
  const groupsToKeepUnbilled = [];
  for (const meta of groupMeta.values()) {
    const expectedIds = [...meta.expectedInvoiceStudentIds];
    const allExpectedProcessed = expectedIds.every((id) => meta.processedStudentIds.has(id));
    const canMarkBilled =
      !meta.conflict &&
      (meta.groupTotalAmount <= 0 ||
        (meta.expectedInvoiceStudentIds.size > 0 && allExpectedProcessed));

    if (canMarkBilled) groupsReadyToMarkBilled.push(meta.group);
    else groupsToKeepUnbilled.push(meta.group);
  }

  if (!studentId && !roomId) {
    if (groupsReadyToMarkBilled.length) await markGroupsBilled(groupsReadyToMarkBilled, true);
    if (groupsToKeepUnbilled.length) await markGroupsBilled(groupsToKeepUnbilled, false);
  }

  return {
    invoicesCreated,
    invoicesUpdated,
    invoicesCancelled,
    skippedConflicts,
    totalStudents: studentsSeen.size,
    message: `Created or updated EW invoices for ${studentsSeen.size} student(s)${
      skippedConflicts > 0 ? `. ${skippedConflicts} conflict(s) were skipped and left unbilled.` : ''
    }`,
  };
};

const countOccupiedBeds = async (blockId, billingDate = new Date(), previousBoundary = null) => {
  const contracts = await getContractsForBlock(blockId, { populateRoom: false });
  const { start, end } = getBillingIntervalBounds(billingDate, previousBoundary);
  return buildIntervalOccupancyAllocation(contracts, start, end, 0).averageOccupiedBeds;
};

const getEWUsages = async (query) => {
  const { block_name, type, month, year, page = 1, limit = 20 } = query;
  const filter = {};

  if (block_name) filter.block_name = { $regex: block_name, $options: 'i' };
  if (type && ['electric', 'water'].includes(type)) filter.type = type;
  applyMonthYearDateFilter(filter, month, year);

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const total = await EWUsage.countDocuments(filter);
  const docs = await EWUsage.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));
  const data = docs.map((d) => d.toJSON());
  const latestIds = await getLatestRecordIdsByKeys(docs);

  return {
    data: data.map((item) => ({ ...item, is_latest_editable: latestIds.has(item.id) })),
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / parseInt(limit, 10)),
  };
};

const createEWUsage = async (body) => {
  const { block: blockId, type, meter_right = 0, date, term } = body;
  const recordDate = normalizeRecordDate(date);

  const block = await Block.findById(blockId).populate('dorm').lean();
  if (!block) throw new AppError('Block not found', 404);
  if (Number.isNaN(recordDate.getTime())) throw new AppError('Invalid date', 400);
  assertNotFutureDate(recordDate);

  await assertDateFollowsLatestRecord(block._id, type, recordDate);
  const existingOnDate = await findRecordOnSameDate(block._id, type, recordDate);
  if (existingOnDate) {
    throw new AppError(
      `A ${type} usage record already exists on ${formatDateDMY(recordDate)} in this block`,
      400
    );
  }

  const prevRecord = await EWUsage.findOne({ block: block._id, type }).sort({ date: -1, createdAt: -1 }).lean();
  const meterLeft = prevRecord ? (prevRecord.meter_right != null ? prevRecord.meter_right : prevRecord.meter_left) : 0;
  const meterRight = Number(meter_right);
  if (!Number.isFinite(meterRight) || meterRight < 0) {
    throw new AppError('meter_right must be a non-negative number', 400);
  }
  if (meterRight < meterLeft) {
    throw new AppError(
      `meter_right (${meterRight}) must be greater than or equal to the previous meter (${meterLeft})`,
      400
    );
  }

  const consumption = meterRight > meterLeft ? meterRight - meterLeft : 0;
  const amount = consumption > 0 ? consumption * getPricePerUnit(type) : 0;
  const occupiedBeds = await countOccupiedBeds(block._id, recordDate, prevRecord?.date || null);

  const record = new EWUsage({
    block: block._id,
    dorm: block.dorm._id || block.dorm,
    block_name: block.block_name || block.block_code,
    type,
    meter_left: meterLeft,
    meter_right: meterRight,
    consumption,
    amount,
    price_per_unit: getPricePerUnit(type),
    occupied_beds: occupiedBeds,
    amount_per_bed: occupiedBeds > 0 ? Math.round(amount / occupiedBeds) : 0,
    date: recordDate,
    term: term || deriveTermFromDate(recordDate),
    unit: type === 'electric' ? 'kW' : 'm3',
    is_billed: false,
  });

  await record.save();
  await markGroupsBilled([{ blockId: block._id.toString(), monthKey: getMonthKey(recordDate) }], false);
  return record.toJSON();
};

const quickCreateEWUsage = async (body) => {
  const { block: blockId, type, meter_right, date, term, meter_increment = 10 } = body;

  if (!blockId) throw new AppError('block is required', 400);
  if (!type || !['electric', 'water'].includes(type)) throw new AppError('type must be electric or water', 400);

  const latestRecord = await EWUsage.findOne({ block: blockId, type }).sort({ date: -1 }).lean();
  const nextDate = date ? normalizeRecordDate(date) : latestRecord ? getNextUsageDate(latestRecord.date) : normalizeRecordDate(new Date());
  if (Number.isNaN(nextDate.getTime())) throw new AppError('Invalid date', 400);

  const previousMeter = latestRecord ? (latestRecord.meter_right != null ? latestRecord.meter_right : latestRecord.meter_left) : 0;
  const nextMeterRight =
    meter_right !== undefined && meter_right !== null
      ? Number(meter_right)
      : previousMeter + Math.max(Number(meter_increment) || 0, 0);

  if (!Number.isFinite(nextMeterRight) || nextMeterRight < 0) {
    throw new AppError('meter_right must be a non-negative number', 400);
  }

  return createEWUsage({
    block: blockId,
    type,
    meter_right: nextMeterRight,
    date: nextDate.toISOString(),
    term: term || deriveTermFromDate(nextDate),
  });
};

const updateEWUsage = async (id, body) => {
  const record = await EWUsage.findById(id);
  if (!record) throw new AppError('Record not found', 404);

  const newerRecord = await EWUsage.findOne({
    block: record.block,
    type: record.type,
    date: { $gt: record.date },
  }).lean();
  if (newerRecord) throw new AppError('Only the latest record for this block can be edited', 400);

  const nextType = body.type !== undefined ? body.type : record.type;
  const existingOnDate = await findRecordOnSameDate(record.block, nextType, record.date, record._id);
  if (existingOnDate) {
    throw new AppError(
      `A ${nextType} usage record already exists on ${formatDateDMY(record.date)} in this block`,
      400
    );
  }

  if (body.meter_right !== undefined) record.meter_right = Number(body.meter_right);
  if (body.term !== undefined) record.term = body.term;
  if (body.type !== undefined) {
    record.type = body.type;
    record.unit = body.type === 'electric' ? 'kW' : 'm3';
  }

  const prevRecord = await EWUsage.findOne({
    block: record.block,
    type: record.type,
    _id: { $ne: record._id },
    date: { $lt: record.date },
  })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const previousMeter = prevRecord ? (prevRecord.meter_right != null ? prevRecord.meter_right : prevRecord.meter_left) : 0;
  if (!Number.isFinite(record.meter_right) || record.meter_right < 0) {
    throw new AppError('meter_right must be a non-negative number', 400);
  }
  if (record.meter_right < previousMeter) {
    throw new AppError(
      `meter_right (${record.meter_right}) must be greater than or equal to the previous meter (${previousMeter})`,
      400
    );
  }
  record.meter_left = previousMeter;
  record.consumption = record.meter_right > previousMeter ? record.meter_right - previousMeter : 0;
  record.price_per_unit = getPricePerUnit(record.type);
  record.amount = record.consumption > 0 ? record.consumption * record.price_per_unit : 0;
  record.occupied_beds = await countOccupiedBeds(record.block, record.date, prevRecord?.date || null);
  record.amount_per_bed = record.occupied_beds > 0 ? Math.round(record.amount / record.occupied_beds) : 0;
  record.is_billed = false;

  await record.save({ validateBeforeSave: false });
  await markGroupsBilled([{ blockId: record.block.toString(), monthKey: getMonthKey(record.date) }], false);
  return record.toJSON();
};

const resetMeter = async (body) => {
  const { block: blockId, type, meter_right, date } = body;
  if (!blockId) throw new AppError('block is required', 400);
  if (!type || !['electric', 'water'].includes(type)) throw new AppError('type must be electric or water', 400);
  if (meter_right === undefined || meter_right === null) throw new AppError('meter_right is required', 400);
  if (Number.isNaN(Number(meter_right)) || Number(meter_right) < 0) throw new AppError('meter_right must be a non-negative number', 400);
  if (!date) throw new AppError('date is required', 400);

  const resetDate = normalizeRecordDate(date);
  if (Number.isNaN(resetDate.getTime())) throw new AppError('Invalid date', 400);
  assertNotFutureDate(resetDate, 'Reset date');

  const latestRecord = await EWUsage.findOne({ block: blockId, type }).sort({ date: -1, createdAt: -1 }).lean();
  if (!latestRecord) throw new AppError('No record found for this block and type', 404);

  const latestDate = new Date(latestRecord.date);
  if (getMonthDistance(latestDate, resetDate) !== 0) {
    throw new AppError(
      `Reset date must stay in ${formatMonthYear(latestDate)} because the latest ${type} record is ${formatDateDMY(latestDate)}`,
      400
    );
  }
  if (resetDate.getTime() < latestDate.getTime()) {
    throw new AppError(
      `Reset date must be on or after the latest ${type} record (${formatDateDMY(latestDate)})`,
      400
    );
  }

  const occupiedBeds = await countOccupiedBeds(blockId, resetDate, latestRecord.date || null);
  const resetRecord = await EWUsage.create({
    block: latestRecord.block,
    dorm: latestRecord.dorm,
    block_name: latestRecord.block_name,
    type,
    meter_left: latestRecord.meter_right != null ? latestRecord.meter_right : latestRecord.meter_left,
    meter_right: Number(meter_right),
    consumption: 0,
    amount: 0,
    price_per_unit: getPricePerUnit(type),
    occupied_beds: occupiedBeds,
    amount_per_bed: 0,
    date: resetDate,
    term: deriveTermFromDate(resetDate),
    unit: type === 'electric' ? 'kW' : 'm3',
    is_reset: true,
    is_billed: false,
  });

  await markGroupsBilled(
    [{ blockId: resetRecord.block.toString(), monthKey: getMonthKey(resetRecord.date) }],
    false
  );
  return resetRecord.toJSON();
};

const importEWUsages = async (fileBuffer) => {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  let created = 0;
  let duplicateInFile = 0;
  let duplicateInDB = 0;
  let failed = 0;
  let warnings = 0;
  const errors = [];
  const affectedGroups = new Map();
  const seenInFile = new Set();
  const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const [dormCode, blockCode, typeCode, dateRaw, meterRaw] = row;

    try {
      const validationErrors = [];
      if (!dormCode || String(dormCode).trim() === '') validationErrors.push('Dorm (column A) is required');
      if (!blockCode || String(blockCode).trim() === '') validationErrors.push('Block (column B) is required');
      if (!typeCode || !['E', 'W'].includes(String(typeCode).trim().toUpperCase())) validationErrors.push('Type (column C) must be E or W');
      if (!dateRaw) validationErrors.push('Date (column D) is required');
      if (meterRaw === undefined || meterRaw === null || meterRaw === '') validationErrors.push('Meter (column E) is required');
      else if (Number.isNaN(Number(meterRaw)) || Number(meterRaw) < 0) validationErrors.push('Meter (column E) must be a non-negative number');
      if (validationErrors.length > 0) throw new Error(validationErrors.join('; '));

      const type = String(typeCode).trim().toUpperCase() === 'E' ? 'electric' : 'water';
      let parsedDate;
      if (typeof dateRaw === 'number') {
        const d = xlsx.SSF.parse_date_code(dateRaw);
        parsedDate = buildStrictDate(d.y, d.m, d.d);
      } else {
        const str = String(dateRaw).trim();
        const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (dmyMatch) {
          parsedDate = buildStrictDate(
            Number(dmyMatch[3]),
            Number(dmyMatch[2]),
            Number(dmyMatch[1])
          );
        } else {
          parsedDate = new Date(str);
        }
      }
      if (!parsedDate) throw new Error('Date (column D) is invalid. Use a real date in dd/MM/yyyy format');
      parsedDate = normalizeRecordDate(parsedDate);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Date (column D) is invalid');
      assertNotFutureDate(parsedDate, 'Date (column D)');
      if (Date.now() - parsedDate.getTime() > TWO_YEARS_MS) throw new Error(`Date (column D) is too far in the past (${formatDateDMY(parsedDate)})`);

      const fileKey = `${String(dormCode).trim().toUpperCase()}|${String(blockCode).trim().toUpperCase()}|${type}|${parsedDate.toISOString().slice(0, 10)}`;
      if (seenInFile.has(fileKey)) {
        duplicateInFile++;
        errors.push({ row: i + 1, block: blockCode, error: `Duplicate in file for ${formatDateDMY(parsedDate)}` });
        continue;
      }
      seenInFile.add(fileKey);

      const dormDoc = await Dorm.findOne({ dorm_code: String(dormCode).trim().toUpperCase() }).lean();
      if (!dormDoc) throw new Error(`Dorm not found: ${dormCode}`);

      const block = await Block.findOne({
        block_code: String(blockCode).trim(),
        dorm: dormDoc._id,
      }).populate('dorm');
      if (!block) throw new Error(`Block not found in the system: dorm=${dormCode}, block=${blockCode}`);

      await assertDateFollowsLatestRecord(block._id, type, parsedDate);
      const existingOnDate = await findRecordOnSameDate(block._id, type, parsedDate);
      if (existingOnDate) {
        duplicateInDB++;
        errors.push({ row: i + 1, block: blockCode, error: `A record already exists on ${formatDateDMY(parsedDate)}` });
        continue;
      }

      const prevRecord = await EWUsage.findOne({ block: block._id, type }).sort({ date: -1, createdAt: -1 }).lean();
      const oldMeter = prevRecord ? (prevRecord.meter_right != null ? prevRecord.meter_right : prevRecord.meter_left) : 0;
      const newMeter = Number(meterRaw);
      if (newMeter < oldMeter) {
        failed++;
        errors.push({
          row: i + 1,
          block: blockCode,
          error: `Meter (column E) must be greater than or equal to the previous meter (${oldMeter}). Current value: ${newMeter}`,
        });
        continue;
      }

      let consumption = 0;
      if (newMeter > oldMeter) {
        consumption = newMeter - oldMeter;
      }

      const amount = consumption > 0 ? consumption * getPricePerUnit(type) : 0;
      const occupiedBeds = await countOccupiedBeds(block._id, parsedDate, prevRecord?.date || null);

      await EWUsage.create({
        block: block._id,
        dorm: block.dorm._id || block.dorm,
        block_name: block.block_name || block.block_code,
        type,
        meter_left: oldMeter,
        meter_right: newMeter,
        consumption,
        amount,
        price_per_unit: getPricePerUnit(type),
        occupied_beds: occupiedBeds,
        amount_per_bed: occupiedBeds > 0 ? Math.round(amount / occupiedBeds) : 0,
        date: parsedDate,
        term: deriveTermFromDate(parsedDate),
        unit: type === 'electric' ? 'kW' : 'm3',
        is_billed: false,
      });

      affectedGroups.set(getGroupKey(block._id, parsedDate), {
        blockId: block._id.toString(),
        monthKey: getMonthKey(parsedDate),
      });
      created++;
    } catch (err) {
      failed++;
      errors.push({ row: i + 1, block: blockCode, error: err.message });
    }
  }

  if (affectedGroups.size) {
    await markGroupsBilled(Array.from(affectedGroups.values()), false);
  }

  return { created, duplicateInFile, duplicateInDB, failed, warnings, errors };
};

const exportEWUsages = async (query) => {
  const { block_name, type, month, year } = query;
  if (!month || !year) {
    throw new AppError('month and year are required to export EW usages', 400);
  }

  const parsedMonth = parseInt(month, 10);
  const parsedYear = parseInt(year, 10);
  if (
    Number.isNaN(parsedMonth) ||
    Number.isNaN(parsedYear) ||
    parsedMonth < 1 ||
    parsedMonth > 12
  ) {
    throw new AppError('month or year is invalid for EW export', 400);
  }

  const filter = {};
  if (block_name) filter.block_name = { $regex: block_name, $options: 'i' };
  if (type && ['electric', 'water'].includes(type)) filter.type = type;
  applyMonthYearDateFilter(filter, parsedMonth, parsedYear);
  const [records, blocks] = await Promise.all([
    EWUsage.find(filter).sort({ block_name: 1, type: 1, date: 1 }).lean(),
    Block.find({
      ...(block_name ? { block_name: { $regex: block_name, $options: 'i' } } : {}),
      is_active: true,
    })
      .populate({ path: 'dorm', select: 'dorm_name dorm_code is_active' })
      .sort({ block_name: 1, block_code: 1 })
      .lean(),
  ]);

  const eligibleBlocks = blocks.filter((block) => block.dorm?.is_active);
  const typesToExport = type && ['electric', 'water'].includes(type) ? [type] : ['electric', 'water'];
  const rows = [];

  eligibleBlocks.forEach((block) => {
    typesToExport.forEach((usageType) => {
      const blockRecords = records.filter(
        (record) => record.block?.toString() === block._id.toString() && record.type === usageType
      );

      if (!blockRecords.length) {
        rows.push({
          'Dorm Code': block.dorm?.dorm_code || '',
          'Dorm Name': block.dorm?.dorm_name || '',
          'Block Code': block.block_code || '',
          'Block Name': block.block_name || '',
          'Usage Type': usageType === 'electric' ? 'Electric' : 'Water',
          'Created Date': '',
          'Meter Left': '',
          'Meter Right': '',
          Consumption: '',
          Unit: usageType === 'electric' ? 'kW' : 'm3',
          'Price Per Unit': getPricePerUnit(usageType),
          Amount: '',
          'Billed Status': 'No Data',
        });
        return;
      }

      blockRecords.forEach((record) => {
        rows.push({
          'Dorm Code': block.dorm?.dorm_code || '',
          'Dorm Name': block.dorm?.dorm_name || '',
          'Block Code': block.block_code || '',
          'Block Name': block.block_name || '',
          'Usage Type': record.type === 'electric' ? 'Electric' : 'Water',
          'Created Date': record.date ? formatDateDMY(record.date) : '',
          'Meter Left': record.meter_left,
          'Meter Right': record.meter_right,
          Consumption: record.consumption,
          Unit: record.unit,
          'Price Per Unit': record.price_per_unit,
          Amount: record.amount,
          'Billed Status': record.is_billed ? 'Completed' : 'Pending Invoice',
        });
      });
    });
  });

  const sheetData = rows.map((row, index) => ({
    '#': index + 1,
    ...row,
  }));
  const ws = xlsx.utils.json_to_sheet(sheetData);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'EW Usages');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const getMyEWUsages = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) throw new AppError('Student profile not found', 404);

  const contract = await Contract.findOne({ student: student._id, status: { $in: ['active', 'extended'] } })
    .populate('room')
    .lean();
  if (!contract || !contract.room) {
    return { block_name: null, data: [], message: 'No active room assignment found' };
  }

  const room = contract.room;
  const blockDoc = await Block.findById(room.block).lean();
  const blockName = blockDoc?.block_name || blockDoc?.block_code || null;
  const records = await EWUsage.find({ block: room.block, consumption: { $gt: 0 } })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const groups = getGroupsFromRecords(records);
  const shareByRecordId = new Map();
  const occupiedByRecordId = new Map();
  const intervalMetaByRecordId = new Map();

  for (const group of groups) {
    const computation = await buildGroupComputation(group.blockId, group.monthKey);
    computation.recordSummaries.forEach((summary) => {
      occupiedByRecordId.set(summary.recordId, summary.occupiedBeds);
      intervalMetaByRecordId.set(summary.recordId, {
        billingStudents: summary.billingStudents,
        totalStudentDays: summary.totalStudentDays,
        intervalDays: summary.intervalDays,
      });
    });
    computation.perRecordStudentShare.forEach((allocation, key) => {
      const [recordId, studentId] = key.split('_');
      if (studentId === student._id.toString()) shareByRecordId.set(recordId, allocation);
    });
  }

  return {
    block_name: blockName,
    room_number: room.room_number,
    data: records
      .map((record) => {
        const recordId = record._id.toString();
        const allocation = shareByRecordId.get(recordId);
        const intervalMeta = intervalMetaByRecordId.get(recordId) || {};
        return {
          id: record._id,
          term: record.term,
          date: record.date,
          type: record.type,
          meter_left: record.meter_left,
          meter_right: record.meter_right,
          consumption: record.consumption,
          unit: record.unit,
          price_per_unit: record.price_per_unit,
          occupied_beds: occupiedByRecordId.get(recordId) ?? record.occupied_beds ?? 0,
          billing_students: allocation?.billingStudents ?? intervalMeta.billingStudents ?? 0,
          billing_days: allocation?.intervalDays ?? intervalMeta.intervalDays ?? 0,
          total_student_days: allocation?.totalStudentDays ?? intervalMeta.totalStudentDays ?? 0,
          student_days: allocation?.studentDays ?? 0,
          is_prorated:
            Boolean(allocation) &&
            allocation.billingStudents > 0 &&
            allocation.intervalDays > 0 &&
            allocation.totalStudentDays !== allocation.billingStudents * allocation.intervalDays,
          total_amount: record.amount,
          amount: allocation?.share ?? 0,
        };
      })
      .filter((record) => record.amount > 0),
  };
};

const recalculate = async (filters = {}) => {
  const groups = await collectGroupsFromFilters(filters, {
    onlyUnbilled: !filters.block && !filters.month && !filters.year,
  });
  return recalculateGroups(groups);
};

const createEWInvoices = async (body = {}, io = null) => {
  const { block, month, year, student_id: studentId, room_id: roomId, due_date: dueDate } = body;
  if (!month || !year) throw new AppError('month and year are required to create EW invoices', 400);

  const targetMonth = Number(month);
  const targetYear = Number(year);
  const currentParts = getDatePartsInDormTimezone(new Date());
  const currentMonthStart = normalizeDateOnlyPartsToDormNoonUtc(
    currentParts.year,
    currentParts.month,
    1
  );
  const targetMonthStart = normalizeDateOnlyPartsToDormNoonUtc(targetYear, targetMonth, 1);
  if (targetMonthStart > currentMonthStart) {
    throw new AppError('Cannot create EW invoices for a future month', 400);
  }

  const anyGroups = await collectGroupsFromFilters({ block, month, year });
  if (!anyGroups.length) {
    throw new AppError('No EW records found for the selected month', 400);
  }

  const groups = await collectGroupsFromFilters({ block, month, year }, { onlyUnbilled: true });
  if (!groups.length) {
    throw new AppError('EW invoices for the selected month have already been created', 400);
  }

  return createInvoicesForGroups(groups, {
    studentId: studentId || null,
    roomId: roomId || null,
    dueDate: dueDate || null,
    io,
  });
};

const createCheckoutSettlement = async ({
  studentId,
  blockId,
  snapshotDate = new Date(),
  electric_meter_right,
  water_meter_right,
  term,
}) => {
  if (!studentId) throw new AppError('studentId is required', 400);
  if (!blockId) throw new AppError('blockId is required', 400);
  if (electric_meter_right === undefined && water_meter_right === undefined) {
    throw new AppError('At least one utility meter reading is required', 400);
  }

  const normalizedDate = normalizeRecordDate(snapshotDate);
  const createdRecords = [];

  if (electric_meter_right !== undefined && electric_meter_right !== null) {
    createdRecords.push(
      await createEWUsage({
        block: blockId,
        type: 'electric',
        meter_right: electric_meter_right,
        date: normalizedDate.toISOString(),
        term: term || deriveTermFromDate(normalizedDate),
      })
    );
  }

  if (water_meter_right !== undefined && water_meter_right !== null) {
    createdRecords.push(
      await createEWUsage({
        block: blockId,
        type: 'water',
        meter_right: water_meter_right,
        date: normalizedDate.toISOString(),
        term: term || deriveTermFromDate(normalizedDate),
      })
    );
  }

  const normalizedParts = getDatePartsInDormTimezone(normalizedDate);
  const invoiceResult = await createEWInvoices({
    block: blockId,
    month: normalizedParts.month,
    year: normalizedParts.year,
    student_id: studentId,
  });

  return {
    records: createdRecords,
    invoice: invoiceResult,
  };
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
  createEWInvoices,
  createCheckoutSettlement,
  getMyEWUsages,
};
