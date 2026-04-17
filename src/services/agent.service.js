const { Observable } = require('rxjs');
const openaiService = require('./openai.service');
const bookingService = require('./booking.service');
const dormRulesService = require('./dormRules.service');
const { BookingRequest, Contract, Student, UtilityReading } = require('../models');
const { detectPreferredLanguage, normalize } = require('../utils/lang');

const GENERAL_SYSTEM_PROMPT = {
  en: 'You are a friendly AI Assistant in FPT University Dormitory. Answer general support questions clearly and warmly in English. Keep replies concise and human. Do not invent booking, utility, conduct, or dormitory rule data — if the student asks for those, politely say you can help them open the booking flow, check utilities, or view conduct instead.',
  vi: 'Bạn là trợ lý AI thân thiện của Ký túc xá Đại học FPT. Trả lời bằng tiếng Việt, ngắn gọn, gần gũi như một người bạn hỗ trợ. Không bịa đặt thông tin về đặt phòng, điện nước, hạnh kiểm hay nội quy — nếu sinh viên hỏi những nội dung đó, hãy mời bạn ấy dùng chức năng đặt phòng, xem điện nước hoặc xem hạnh kiểm.',
};

const BOOKING_PROMPTS = {
  en: {
    room_type: 'Choose a room type to continue.',
    dorm: 'Choose a dorm building.',
    floor: 'Choose a floor.',
    block: 'Choose a block.',
    room: 'Choose a room.',
    bed: 'Choose a bed, then I will show the booking confirmation card.',
    confirm: 'Review the booking details and agree to the dormitory rules to continue.',
    closed: 'Dormitory booking is not currently open.',
    success: 'Your booking is created. Please complete payment.',
    fail: 'Failed to complete booking.',
    rules_text:
      'I confirm that I have reviewed the booking details and agree to the dormitory rules.',
    room_price_label: 'Room price',
  },
  vi: {
    room_type: 'Vui lòng chọn loại phòng để tiếp tục.',
    dorm: 'Vui lòng chọn tòa ký túc xá.',
    floor: 'Vui lòng chọn tầng.',
    block: 'Vui lòng chọn dãy phòng.',
    room: 'Vui lòng chọn phòng.',
    bed: 'Vui lòng chọn giường, mình sẽ hiển thị thẻ xác nhận đặt phòng ngay sau đó.',
    confirm: 'Vui lòng xem lại thông tin và xác nhận đồng ý với nội quy ký túc xá để tiếp tục.',
    closed: 'Hiện tại chưa mở đợt đăng ký ký túc xá.',
    success: 'Đã tạo yêu cầu đặt phòng. Vui lòng hoàn tất thanh toán.',
    fail: 'Không thể hoàn tất đặt phòng.',
    rules_text: 'Tôi xác nhận đã xem thông tin đặt phòng và đồng ý với nội quy ký túc xá.',
    room_price_label: 'Giá phòng',
  },
};

const UTILITY_MESSAGES = {
  en: {
    no_room:
      'I could not find an active room assignment for you, so there are no utility readings to show yet.',
    no_reading: (label) => `There are no utility readings recorded yet for ${label || 'your room'}.`,
    found: (label) => `Here is the latest utility reading for ${label || 'your room'}.`,
  },
  vi: {
    no_room:
      'Mình chưa tìm thấy phòng đang ở của bạn, nên chưa có chỉ số điện nước để hiển thị.',
    no_reading: (label) =>
      `Chưa có chỉ số điện nước nào được ghi nhận cho ${label || 'phòng của bạn'}.`,
    found: (label) => `Đây là chỉ số điện nước mới nhất của ${label || 'phòng bạn'}.`,
  },
};

const CONDUCT_MESSAGES = {
  en: { summary: 'Here is your current conduct summary.' },
  vi: { summary: 'Đây là thông tin điểm hạnh kiểm hiện tại của bạn.' },
};

const pickLangBucket = (bucket, lang) => bucket[lang] || bucket.en;

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasAnyTerm = (text, terms) => {
  const source = normalize(text);
  if (!source) return false;
  return terms.some((term) => {
    const nt = normalize(term);
    if (!nt) return false;
    const pattern = new RegExp(`(^|\\s)${escapeRegex(nt)}(\\s|$)`);
    return pattern.test(source);
  });
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
    'nội quy',
    'quy định',
    'khách',
    'giờ đóng cửa',
    'giờ mở cửa',
    'nấu ăn',
    'hút thuốc',
    'rượu bia',
    'thú cưng',
    'tiếng ồn',
    'đổi phòng',
    'thiết bị điện',
    'phòng cháy',
  ]);
};

const formatCurrency = (amount) =>
  `${new Intl.NumberFormat('vi-VN').format(Number(amount || 0))} VND`;

const formatRoomTypeLabel = (roomType) => {
  const value = String(roomType || '').replace(/_/g, ' ').trim();
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

    const chunks = text.split(/\n{2,}/).flatMap((block) =>
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

const buildBookingSummary = (bookingState, semesterLabel, lang = 'en') => {
  const prompts = pickLangBucket(BOOKING_PROMPTS, lang);
  const labels =
    lang === 'vi'
      ? {
          Semester: 'Học kỳ',
          'Room type': 'Loại phòng',
          Dorm: 'Tòa',
          Floor: 'Tầng',
          Block: 'Dãy',
          Room: 'Phòng',
          Bed: 'Giường',
          Note: 'Ghi chú',
        }
      : {
          Semester: 'Semester',
          'Room type': 'Room type',
          Dorm: 'Dorm',
          Floor: 'Floor',
          Block: 'Block',
          Room: 'Room',
          Bed: 'Bed',
          Note: 'Note',
        };

  const rows = [
    [labels.Semester, semesterLabel || bookingState.semester || '—'],
    [labels['Room type'], bookingState.room_type_label || bookingState.room_type || '—'],
    [labels.Dorm, bookingState.dorm_name || bookingState.dorm_id || '—'],
    [labels.Floor, bookingState.floor != null ? String(bookingState.floor) : '—'],
    [labels.Block, bookingState.block_name || bookingState.block_id || '—'],
    [labels.Room, bookingState.room_number || bookingState.room_id || '—'],
    [labels.Bed, bookingState.bed_number || bookingState.bed_id || '—'],
  ];

  if (bookingState.price_per_semester != null) {
    rows.push([prompts.room_price_label, formatCurrency(bookingState.price_per_semester)]);
  }

  if (bookingState.note) {
    rows.push([labels.Note, bookingState.note]);
  }

  return rows.map(([label, value]) => ({ label, value }));
};

const buildOption = (value, label, description) => ({
  value,
  label,
  description: description || '',
});

const getBookingPrompt = (step, lang = 'en') => {
  const prompts = pickLangBucket(BOOKING_PROMPTS, lang);
  return prompts[step] || prompts.confirm;
};

const describeBedsAvailable = (count, lang = 'en') =>
  lang === 'vi' ? `Còn ${count} giường trống` : `${count} beds available`;

const describeTapToReview = (lang = 'en') =>
  lang === 'vi' ? 'Chạm để xem lại và xác nhận' : 'Tap to review and confirm';

const resolveBookingFlow = async (userId, bookingState = {}, lang = 'en') => {
  const prompts = pickLangBucket(BOOKING_PROMPTS, lang);
  const bookingWindow = await bookingService.getBookingWindowStatus(userId);
  if (!bookingWindow.allowed) {
    return createStructuredStream({
      content: prompts.closed,
      meta: {
        type: 'booking_closed',
        window_type: bookingWindow.window_type || null,
        lang,
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
      content: getBookingPrompt('room_type', lang),
      meta: {
        type: 'booking_options',
        step: 'room_type',
        draft,
        lang,
        options: roomTypes.map((roomType) =>
          buildOption(
            {
              room_type: roomType.room_type,
              room_type_label: formatRoomTypeLabel(roomType.room_type),
              price_per_semester: roomType.price_per_semester,
            },
            formatRoomTypeLabel(roomType.room_type),
            `${describeBedsAvailable(roomType.available_slots, lang)} · ${formatCurrency(roomType.price_per_semester)}`
          )
        ),
      },
    });
  }

  if (!draft.dorm_id) {
    const dorms = await bookingService.getDormsForBooking(userId, draft.room_type);
    return createStructuredStream({
      content: getBookingPrompt('dorm', lang),
      meta: {
        type: 'booking_options',
        step: 'dorm',
        draft,
        lang,
        options: dorms.map((dorm) =>
          buildOption(
            {
              dorm_id: dorm.dorm_id,
              dorm_name: dorm.dorm_name,
              dorm_code: dorm.dorm_code,
            },
            dorm.dorm_name,
            describeBedsAvailable(dorm.available_slots, lang)
          )
        ),
      },
    });
  }

  if (draft.floor == null) {
    const floors = await bookingService.getFloorsForBooking(userId, draft.dorm_id, draft.room_type);

    return createStructuredStream({
      content: getBookingPrompt('floor', lang),
      meta: {
        type: 'booking_options',
        step: 'floor',
        draft,
        lang,
        options: floors.map((floor) =>
          buildOption(
            { floor: floor.floor },
            lang === 'vi' ? `Tầng ${floor.floor}` : `Floor ${floor.floor}`,
            describeBedsAvailable(floor.available_slots, lang)
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
      content: getBookingPrompt('block', lang),
      meta: {
        type: 'booking_options',
        step: 'block',
        draft,
        lang,
        options: blocks.map((block) =>
          buildOption(
            {
              block_id: block.block_id,
              block_name: block.block_name,
              block_code: block.block_code,
            },
            block.block_code || block.block_name,
            describeBedsAvailable(block.available_slots, lang)
          )
        ),
      },
    });
  }

  if (!draft.room_id) {
    const rooms = await bookingService.getRoomsForBooking(userId, draft.block_id, draft.room_type);

    return createStructuredStream({
      content: getBookingPrompt('room', lang),
      meta: {
        type: 'booking_options',
        step: 'room',
        draft,
        lang,
        options: rooms.map((room) =>
          buildOption(
            {
              room_id: room.id || room._id?.toString(),
              room_number: room.room_number,
              price_per_semester: room.price_per_semester,
            },
            lang === 'vi' ? `Phòng ${room.room_number}` : `Room ${room.room_number}`,
            `${describeBedsAvailable(room.available_beds, lang)} · ${formatCurrency(room.price_per_semester)}`
          )
        ),
      },
    });
  }

  if (!draft.bed_id) {
    const beds = await bookingService.getBedsForBooking(userId, draft.room_id);

    return createStructuredStream({
      content: getBookingPrompt('bed', lang),
      meta: {
        type: 'booking_options',
        step: 'bed',
        draft,
        lang,
        options: beds.map((bed) =>
          buildOption(
            {
              bed_id: bed.id || bed._id?.toString(),
              bed_number: bed.bed_number,
            },
            lang === 'vi' ? `Giường ${bed.bed_number}` : `Bed ${bed.bed_number}`,
            describeTapToReview(lang)
          )
        ),
      },
    });
  }

  if (!draft.rules_accepted) {
    return createStructuredStream({
      content: getBookingPrompt('confirm', lang),
      meta: {
        type: 'booking_confirm',
        draft,
        lang,
        summary: buildBookingSummary(draft, nextSemester.semester, lang),
        rules_text: prompts.rules_text,
      },
    });
  }

  try {
    const result = await bookingService.submitBooking(userId, {
      bed_id: draft.bed_id,
      note: draft.note,
    });

    return createStructuredStream({
      content: prompts.success,
      meta: {
        type: 'payment_handoff',
        lang,
        booking: result.booking,
        invoice: result.invoice,
        payos: result.payos || null,
        resumeBookingId: result.booking.id || result.booking._id?.toString(),
        checkoutUrl: result.payos?.checkoutUrl || null,
      },
    });
  } catch (error) {
    return createStructuredStream({
      content: error?.message || prompts.fail,
      meta: {
        type: 'booking_error',
        lang,
      },
    });
  }
};

const resolveUtilityLookup = async (userId, lang = 'en') => {
  const msgs = pickLangBucket(UTILITY_MESSAGES, lang);
  const { room, bed, source } = await getStudentRoomContext(userId);

  if (!room) {
    return createStructuredStream({
      content: msgs.no_room,
      meta: {
        type: 'utility_summary',
        has_data: false,
        room: null,
        lang,
      },
    });
  }

  const latestReading = await UtilityReading.findOne({ room: room._id })
    .sort({ recorded_at: -1, createdAt: -1 })
    .lean();

  const roomPrefix = lang === 'vi' ? 'Phòng' : 'Room';
  const bedPrefix = lang === 'vi' ? 'Giường' : 'Bed';
  const roomLabel = [
    room.block?.dorm?.dorm_name,
    room.block?.block_code,
    room.room_number ? `${roomPrefix} ${room.room_number}` : null,
    bed?.bed_number != null ? `${bedPrefix} ${bed.bed_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!latestReading) {
    return createStructuredStream({
      content: msgs.no_reading(roomLabel),
      meta: {
        type: 'utility_summary',
        has_data: false,
        room: {
          id: room._id,
          label: roomLabel,
          source,
        },
        lang,
      },
    });
  }

  return createStructuredStream({
    content: msgs.found(roomLabel),
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
      lang,
    },
  });
};

const resolveConductLookup = async (userId, lang = 'en') => {
  const msgs = pickLangBucket(CONDUCT_MESSAGES, lang);
  const student = await getStudentProfile(userId);

  return createStructuredStream({
    content: msgs.summary,
    meta: {
      type: 'conduct_summary',
      student: {
        id: student._id,
        student_code: student.student_code,
        full_name: student.full_name,
      },
      behavioral_score: student.behavioral_score,
      violations_current_semester: student.violations_current_semester,
      lang,
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
    'register room',
    'đặt phòng',
    'đặt giường',
    'thuê phòng',
    'đăng ký phòng',
    'đăng ký ở',
    'tìm phòng',
    'chọn phòng',
    'giữ giường',
    'book phòng',
    'book giường',
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
    'pets',
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
    'nội quy',
    'quy định',
    'quy tắc',
    'khách',
    'người thân',
    'giờ đóng cửa',
    'giờ mở cửa',
    'giờ nghiêm',
    'về trễ',
    'qua đêm',
    'nấu ăn',
    'bếp',
    'nồi lẩu',
    'hút thuốc',
    'thuốc lá',
    'rượu',
    'bia',
    'chất kích thích',
    'ma túy',
    'thú cưng',
    'động vật',
    'nuôi chó',
    'nuôi mèo',
    'ồn ào',
    'tiếng ồn',
    'đổi phòng',
    'chuyển phòng',
    'đổi giường',
    'thiết bị điện',
    'tủ lạnh',
    'phòng cháy',
    'chất dễ cháy',
    'bình gas',
    'xăng dầu',
    'chất nổ',
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
    'còn gì nữa không',
    'thêm gì nữa',
    'có thêm không',
    'kể thêm',
    'còn nữa không',
    'hết chưa',
    'tất cả chưa',
    'nữa không',
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
    'điện',
    'nước',
    'điện nước',
    'đồng hồ',
    'chỉ số',
    'tiêu thụ',
    'hóa đơn',
    'số điện',
    'số nước',
    'đọc chỉ số',
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
    'hạnh kiểm',
    'điểm hạnh kiểm',
    'vi phạm',
    'kỷ luật',
    'điểm rèn luyện',
    'bị phạt',
    'xử lý kỷ luật',
    'đánh giá hạnh kiểm',
  ]);
};

const isSmallTalkIntent = (question) => {
  return hasAnyTerm(question, [
    'hello',
    'hi',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
    'how are you',
    'what can you do',
    'who are you',
    'what are you',
    'thank you',
    'thanks',
    'bye',
    'goodbye',
    'xin chào',
    'chào',
    'chào bạn',
    'chào buổi sáng',
    'chào buổi chiều',
    'chào buổi tối',
    'bạn khỏe không',
    'bạn là ai',
    'bạn có thể làm gì',
    'bạn giúp được gì',
    'cảm ơn',
    'tạm biệt',
  ]);
};

const classifyIntent = (question, bookingState = {}, histories = []) => {
  if (isBookingIntent(question, bookingState)) return 'booking';
  if (
    isDormRulesIntent(question) ||
    (isDormRulesFollowUpIntent(question) && hasDormRulesContext(histories))
  ) {
    return 'regulation';
  }
  if (isUtilityIntent(question)) return 'utility';
  if (isConductIntent(question)) return 'conduct';
  if (isSmallTalkIntent(question)) return 'smalltalk';
  return 'unknown';
};

const answer = async (payload, userId) => {
  const question = payload?.question || '';
  const histories = Array.isArray(payload?.histories) ? payload.histories : [];
  const assistantState = payload?.assistant_state || payload?.assistantState || {};
  const bookingState = assistantState.booking || payload?.bookingState || {};

  const lang = detectPreferredLanguage(question);
  const intent = classifyIntent(question, bookingState, histories);

  if (intent === 'regulation') {
    const kb = await dormRulesService.getDormRulesKnowledgeBase();

    if (!kb) {
      return createStructuredStream({
        content:
          lang === 'vi'
            ? 'Nội quy ký túc xá chưa được cập nhật.'
            : 'Dormitory rules are not configured yet.',
        meta: { type: 'dorm_rules_missing', lang },
      });
    }

    const dormRulesAnswer = await dormRulesService.queryRules(question);
    return createChunkedTextStream(dormRulesAnswer.answer);
  }

  if (intent === 'booking') {
    return resolveBookingFlow(userId, bookingState, lang);
  }

  if (intent === 'utility') {
    return resolveUtilityLookup(userId, lang);
  }

  if (intent === 'conduct') {
    return resolveConductLookup(userId, lang);
  }

  const systemPrompt = pickLangBucket(GENERAL_SYSTEM_PROMPT, lang);

  const stream$ = await openaiService.stream({
    messages: [
      { role: 'system', content: systemPrompt },
      ...histories,
      { role: 'user', content: question },
    ],
  });

  return stream$;
};

module.exports = {
  answer,
  classifyIntent,
};
