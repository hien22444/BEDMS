const { Observable } = require('rxjs');
const openaiService = require('./openai.service');
const bookingService = require('./booking.service');
const dormRulesService = require('./dormRules.service');
const { BookingRequest, Contract, Student, UtilityReading } = require('../models');

const GENERAL_SYSTEM_PROMPT =
  'You are an AI Assistant in FPT University Dormitory. Answer general support questions clearly. Do not invent booking, utility, conduct, or dormitory rule data.';

const toText = (value) => String(value || '').trim();

const normalize = (value) => toText(value).toLowerCase();

const hasAnyTerm = (text, terms) => {
  const source = normalize(text);
  return terms.some((term) => source.includes(term));
};

const hasDormRulesContext = (histories = []) => {
  const recentText = histories
    .slice(-8)
    .map((message) => String(message?.content || ''))
    .join(' ');

  return hasAnyTerm(recentText, [
    'dorm rules',
    'dormitory rules',
    'regulation',
    'regulations',
    'guest policy',
    'curfew',
    'cooking',
    'smoking',
    'alcohol',
    'pet',
    'noise',
    'room change',
    'allowed devices',
    'fire safety',
    'opening hours',
    'closing time',
  ]);
};

const formatCurrency = (amount) =>
  `${new Intl.NumberFormat('vi-VN').format(Number(amount || 0))} VND`;

const formatRoomTypeLabel = (roomType) => {
  const value = toText(roomType).replace(/_/g, ' ').trim();
  if (!value) return 'Room type';

  const match = value.match(/^(\d+)\s*bed/i);
  if (match) {
    return `${match[1]}-bed room`;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
};

const createStructuredStream = ({ content = '', meta = null }) => {
  return new Observable((subscriber) => {
    if (content) {
      subscriber.next({ content });
    }
    if (meta) {
      subscriber.next({ meta });
    }
    subscriber.complete();
  });
};

const createChunkedTextStream = (content = '') => {
  return new Observable((subscriber) => {
    const text = String(content || '').trim();
    if (!text) {
      subscriber.complete();
      return;
    }

    const chunks = text
      .split(/\n{2,}/)
      .flatMap((block) =>
        block
          .split(/(?<=[.!?])\s+/)
          .map((part) => part.trim())
          .filter(Boolean)
      );

    if (chunks.length === 0) {
      subscriber.next({ content: text });
      subscriber.complete();
      return;
    }

    chunks.forEach((chunk, index) => {
      const suffix = index < chunks.length - 1 ? ' ' : '';
      subscriber.next({ content: `${chunk}${suffix}` });
    });
    subscriber.complete();
  });
};

const getStudentProfile = async (userId) => {
  const student = await Student.findOne({ user: userId }).lean();
  if (!student) {
    throw new Error('Student profile not found');
  }
  return student;
};

const getStudentRoomContext = async (userId) => {
  const student = await getStudentProfile(userId);

  const populateRoom = {
    path: 'room',
    populate: {
      path: 'block',
      select: 'block_name block_code gender_type dorm',
      populate: {
        path: 'dorm',
        select: 'dorm_name dorm_code',
      },
    },
  };

  const activeContract = await Contract.findOne({
    student: student._id,
    status: 'active',
  })
    .populate(populateRoom)
    .populate('bed', 'bed_number')
    .lean();

  if (activeContract?.room) {
    return {
      student,
      room: activeContract.room,
      bed: activeContract.bed || null,
      source: 'active_contract',
    };
  }

  const latestApprovedBooking = await BookingRequest.findOne({
    student: student._id,
    status: 'approved',
    checkout_date: null,
  })
    .sort({ requested_at: -1 })
    .populate(populateRoom)
    .populate('bed', 'bed_number')
    .lean();

  if (latestApprovedBooking?.room) {
    return {
      student,
      room: latestApprovedBooking.room,
      bed: latestApprovedBooking.bed || null,
      source: 'approved_booking',
    };
  }

  return {
    student,
    room: null,
    bed: null,
    source: null,
  };
};

const buildBookingSummary = (bookingState, semesterLabel) => {
  const rows = [
    ['Semester', semesterLabel || bookingState.semester || '—'],
    ['Room type', bookingState.room_type_label || bookingState.room_type || '—'],
    ['Dorm', bookingState.dorm_name || bookingState.dorm_id || '—'],
    ['Floor', bookingState.floor != null ? String(bookingState.floor) : '—'],
    ['Block', bookingState.block_name || bookingState.block_id || '—'],
    ['Room', bookingState.room_number || bookingState.room_id || '—'],
    ['Bed', bookingState.bed_number || bookingState.bed_id || '—'],
  ];

  if (bookingState.price_per_semester != null) {
    rows.push(['Room price', formatCurrency(bookingState.price_per_semester)]);
  }

  if (bookingState.note) {
    rows.push(['Note', bookingState.note]);
  }

  return rows.map(([label, value]) => ({ label, value }));
};

const buildOption = (value, label, description) => ({
  value,
  label,
  description: description || '',
});

const getBookingPrompt = (step) => {
  switch (step) {
    case 'room_type':
      return 'Choose a room type to continue.';
    case 'dorm':
      return 'Choose a dorm building.';
    case 'floor':
      return 'Choose a floor.';
    case 'block':
      return 'Choose a block.';
    case 'room':
      return 'Choose a room.';
    case 'bed':
      return 'Choose a bed, then I will show the booking confirmation card.';
    default:
      return 'Review the booking details and confirm the dormitory rules to continue.';
  }
};

const resolveBookingFlow = async (userId, bookingState = {}) => {
  const bookingWindow = await bookingService.getBookingWindowStatus(userId);
  if (!bookingWindow.allowed) {
    return createStructuredStream({
      content: 'Dormitory booking is not currently open.',
      meta: {
        type: 'booking_closed',
        window_type: bookingWindow.window_type || null,
      },
    });
  }

  const nextSemester = await bookingService.getNextSemesterInfo(userId);
  const draft = {
    ...bookingState,
    semester: bookingState.semester || nextSemester.semester,
  };

  if (!draft.room_type) {
    const roomTypes = await bookingService.getAvailableRoomTypes(userId);
    return createStructuredStream({
      content: getBookingPrompt('room_type'),
      meta: {
        type: 'booking_options',
        step: 'room_type',
        draft,
        options: roomTypes.map((roomType) =>
          buildOption(
            {
              room_type: roomType.room_type,
              room_type_label: formatRoomTypeLabel(roomType.room_type),
              price_per_semester: roomType.price_per_semester,
            },
            formatRoomTypeLabel(roomType.room_type),
            `${roomType.available_slots} beds available · ${formatCurrency(roomType.price_per_semester)}`
          )
        ),
      },
    });
  }

  if (!draft.dorm_id) {
    const dorms = await bookingService.getDormsForBooking(userId, draft.room_type);
    return createStructuredStream({
      content: getBookingPrompt('dorm'),
      meta: {
        type: 'booking_options',
        step: 'dorm',
        draft,
        options: dorms.map((dorm) =>
          buildOption(
            {
              dorm_id: dorm.dorm_id,
              dorm_name: dorm.dorm_name,
              dorm_code: dorm.dorm_code,
            },
            dorm.dorm_name,
            `${dorm.available_slots} beds available`
          )
        ),
      },
    });
  }

  if (draft.floor == null) {
    const floors = await bookingService.getFloorsForBooking(userId, draft.dorm_id, draft.room_type);

    return createStructuredStream({
      content: getBookingPrompt('floor'),
      meta: {
        type: 'booking_options',
        step: 'floor',
        draft,
        options: floors.map((floor) =>
          buildOption(
            {
              floor: floor.floor,
            },
            `Floor ${floor.floor}`,
            `${floor.available_slots} beds available`
          )
        ),
      },
    });
  }

  if (!draft.block_id) {
    const blocks = await bookingService.getBlocksForBooking(
      userId,
      draft.dorm_id,
      draft.floor,
      draft.room_type
    );

    return createStructuredStream({
      content: getBookingPrompt('block'),
      meta: {
        type: 'booking_options',
        step: 'block',
        draft,
        options: blocks.map((block) =>
          buildOption(
            {
              block_id: block.block_id,
              block_name: block.block_name,
              block_code: block.block_code,
            },
            block.block_code || block.block_name,
            `${block.available_slots} beds available`
          )
        ),
      },
    });
  }

  if (!draft.room_id) {
    const rooms = await bookingService.getRoomsForBooking(userId, draft.block_id, draft.room_type);

    return createStructuredStream({
      content: getBookingPrompt('room'),
      meta: {
        type: 'booking_options',
        step: 'room',
        draft,
        options: rooms.map((room) =>
          buildOption(
            {
              room_id: room.id || room._id?.toString(),
              room_number: room.room_number,
              price_per_semester: room.price_per_semester,
            },
            `Room ${room.room_number}`,
            `${room.available_beds} beds available · ${formatCurrency(room.price_per_semester)}`
          )
        ),
      },
    });
  }

  if (!draft.bed_id) {
    const beds = await bookingService.getBedsForBooking(userId, draft.room_id);

    return createStructuredStream({
      content: getBookingPrompt('bed'),
      meta: {
        type: 'booking_options',
        step: 'bed',
        draft,
        options: beds.map((bed) =>
          buildOption(
            {
              bed_id: bed.id || bed._id?.toString(),
              bed_number: bed.bed_number,
            },
            `Bed ${bed.bed_number}`,
            'Tap to review and confirm'
          )
        ),
      },
    });
  }

  if (!draft.rules_accepted) {
    return createStructuredStream({
      content: 'Review the booking details and agree to the dormitory rules to continue.',
      meta: {
        type: 'booking_confirm',
        draft,
        summary: buildBookingSummary(draft, nextSemester.semester),
        rules_text:
          'I confirm that I have reviewed the booking details and agree to the dormitory rules.',
      },
    });
  }

  try {
    const result = await bookingService.submitBooking(userId, {
      bed_id: draft.bed_id,
      note: draft.note,
    });

    return createStructuredStream({
      content: 'Your booking is created. Please complete payment.',
      meta: {
        type: 'payment_handoff',
        booking: result.booking,
        invoice: result.invoice,
        payos: result.payos || null,
        resumeBookingId: result.booking.id || result.booking._id?.toString(),
        checkoutUrl: result.payos?.checkoutUrl || null,
      },
    });
  } catch (error) {
    return createStructuredStream({
      content: error?.message || 'Failed to complete booking.',
      meta: {
        type: 'booking_error',
      },
    });
  }
};

const resolveUtilityLookup = async (userId) => {
  const { room, bed, source } = await getStudentRoomContext(userId);

  if (!room) {
    return createStructuredStream({
      content:
        'I could not find an active room assignment for you, so there are no utility readings to show yet.',
      meta: {
        type: 'utility_summary',
        has_data: false,
        room: null,
      },
    });
  }

  const latestReading = await UtilityReading.findOne({ room: room._id })
    .sort({ recorded_at: -1, createdAt: -1 })
    .lean();

  const roomLabel = [
    room.block?.dorm?.dorm_name,
    room.block?.block_code,
    room.room_number ? `Room ${room.room_number}` : null,
    bed?.bed_number != null ? `Bed ${bed.bed_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!latestReading) {
    return createStructuredStream({
      content: `There are no utility readings recorded yet for ${roomLabel || 'your room'}.`,
      meta: {
        type: 'utility_summary',
        has_data: false,
        room: {
          id: room._id,
          label: roomLabel,
          source,
        },
      },
    });
  }

  return createStructuredStream({
    content: `Here is the latest utility reading for ${roomLabel || 'your room'}.`,
    meta: {
      type: 'utility_summary',
      has_data: true,
      room: {
        id: room._id,
        label: roomLabel,
        source,
      },
      reading: {
        month: latestReading.reading_month,
        electricity_old_reading: latestReading.electricity_old_reading,
        electricity_new_reading: latestReading.electricity_new_reading,
        electricity_consumption: latestReading.electricity_consumption,
        water_old_reading: latestReading.water_old_reading,
        water_new_reading: latestReading.water_new_reading,
        water_consumption: latestReading.water_consumption,
        recorded_at: latestReading.recorded_at,
      },
    },
  });
};

const resolveConductLookup = async (userId) => {
  const student = await getStudentProfile(userId);

  return createStructuredStream({
    content: 'Here is your current conduct summary.',
    meta: {
      type: 'conduct_summary',
      student: {
        id: student._id,
        student_code: student.student_code,
        full_name: student.full_name,
      },
      behavioral_score: student.behavioral_score,
      violations_current_semester: student.violations_current_semester,
    },
  });
};

const isBookingIntent = (question, bookingState) => {
  if (bookingState && Object.keys(bookingState).length > 0) {
    return true;
  }

  return hasAnyTerm(question, [
    'book',
    'booking',
    'bed',
    'keep bed',
    'reservation',
  ]);
};

const isDormRulesIntent = (question) => {
  return hasAnyTerm(question, [
    'dorm rules',
    'dormitory rules',
    'rules',
    'regulation',
    'regulations',
    'policy',
    'guest',
    'visitor',
    'curfew',
    'opening hours',
    'closing',
    'close',
    'closing time',
    '22:00',
    '22h',
    '10pm',
    '10 pm',
    'overnight',
    'cooking',
    'stove',
    'hot pot',
    'smoking',
    'smoke',
    'cigarette',
    'vape',
    'alcohol',
    'beer',
    'drug',
    'pet',
    'cat',
    'dog',
    'animal',
    'noise',
    'party',
    'change room',
    'switch room',
    'swap room',
    'move bed',
    'allowed devices',
    'electrical devices',
    'refrigerator',
    'fire safety',
    'flammable',
    'gas',
    'fuel',
  ]);
};

const isDormRulesFollowUpIntent = (question) => {
  return hasAnyTerm(question, [
    'is that all',
    'is this all',
    'anything else',
    'what else',
    'more rules',
    'more details',
    'tell me more',
    'anything more',
    'is there anything else',
    'that all',
    'all of them',
  ]);
};

const isUtilityIntent = (question) => {
  return hasAnyTerm(question, [
    'utility',
    'utilities',
    'electricity',
    'water',
    'meter',
    'reading',
    'bill',
  ]);
};

const isConductIntent = (question) => {
  return hasAnyTerm(question, [
    'behavioral',
    'behavioral_score',
    'behavior score',
    'cfd',
    'violation',
    'violations',
    'penalty',
    'conduct',
  ]);
};

const answer = async (payload, userId) => {
  const question = payload?.question || '';
  const histories = Array.isArray(payload?.histories) ? payload.histories : [];
  const assistantState = payload?.assistant_state || payload?.assistantState || {};
  const bookingState = assistantState.booking || payload?.bookingState || {};

  if (isDormRulesIntent(question) || (isDormRulesFollowUpIntent(question) && hasDormRulesContext(histories))) {
    const kb = await dormRulesService.getDormRulesKnowledgeBase();

    if (!kb) {
      return createStructuredStream({
        content: 'Dormitory rules are not configured yet.',
      });
    }

    const dormRulesAnswer = await dormRulesService.queryRules(question);
    return createChunkedTextStream(dormRulesAnswer.answer);
  }

  if (isBookingIntent(question, bookingState)) {
    return resolveBookingFlow(userId, bookingState);
  }

  if (isUtilityIntent(question)) {
    return resolveUtilityLookup(userId);
  }

  if (isConductIntent(question)) {
    return resolveConductLookup(userId);
  }

  const stream$ = await openaiService.stream({
    messages: [
      {
        role: 'system',
        content: GENERAL_SYSTEM_PROMPT,
      },
      ...histories,
      {
        role: 'user',
        content: question,
      },
    ],
  });

  return stream$;
};

module.exports = {
  answer,
};
