const dormRulesKnowledgeBase = {
  knowledge_base: {
    source: 'Nội quy Ký túc xá Trường Đại học FPT cơ sở Hòa Hải',
    source_en: 'FPT University Hoa Hai Campus Dormitory Regulations',
    decision_number: '120/QĐ-FPTUĐN',
    issued_date: '2021-09-15',
    language: 'vi-en',
    version: '2.0',
  },
  rules: [
    {
      id: 'KTX-OPENING-HOURS',
      category: 'general',
      source_ref: 'Điều 1.1; Phụ lục dòng 10',
      title: 'Dormitory opening hours',
      title_en: 'Dormitory opening hours',
      title_vi: 'Giờ mở cửa ký túc xá',
      rule: 'Dormitory gates are open from 05:30 to 22:00.',
      rule_en: 'Dormitory gates are open from 05:30 to 22:00.',
      rule_vi: 'Giờ mở cửa ký túc xá từ 05:30 đến 22:00.',
      details:
        'Students should return before 22:00 unless they have a legitimate reason accepted by dormitory management.',
      details_en:
        'Students should return before 22:00 unless they have a legitimate reason accepted by dormitory management.',
      details_vi:
        'Sinh viên cần về trước 22:00, trừ trường hợp có lý do chính đáng được ban quản lý ký túc xá chấp nhận.',
      keywords: ['curfew', 'closing time', 'opening hours', 'late entry', 'gate closing'],
      keywords_en: ['curfew', 'closing time', 'opening hours', 'late entry', 'gate closing'],
      keywords_vi: ['giờ mở cửa', 'giờ đóng cửa', 'giờ giới nghiêm', 'về muộn', 'sau 22h'],
      example_questions: [
        'What time does the dorm close?',
        'Can I come back after 10 PM?',
        'What is the curfew for the dorm?',
      ],
      example_questions_en: [
        'What time does the dorm close?',
        'Can I come back after 10 PM?',
        'What is the curfew for the dorm?',
      ],
      example_questions_vi: [
        'Ký túc xá đóng cửa lúc mấy giờ?',
        'Em về sau 22h có bị phạt không?',
        'Giờ giới nghiêm của KTX là mấy giờ?',
      ],
      penalty: {
        fine_vnd: 100000,
        description: 'Entering after the regulated time without a legitimate reason.',
        description_en: 'Entering after the regulated time without a legitimate reason.',
        description_vi: 'Vào muộn sau giờ quy định không có lý do chính đáng.',
        first_violation_en: 'Administrative fine.',
        first_violation_vi: 'Phạt hành chính.',
        repeat_penalty_en: 'Dormitory service termination.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX.',
      },
    },
    {
      id: 'KTX-GUEST-POLICY',
      category: 'general',
      source_ref: 'Điều 1.4, Điều 1.8; Phụ lục dòng 18',
      title: 'Guest and visitor policy',
      title_en: 'Guest and visitor policy',
      title_vi: 'Quy định về khách và người ngoài',
      rule: 'Guests must present identification at the security desk and may not stay in the dormitory after 22:00.',
      rule_en:
        'Guests must present identification at the security desk and may not stay in the dormitory after 22:00.',
      rule_vi:
        'Khách đến liên hệ công tác hoặc thăm người nhà ở KTX phải xuất trình giấy tờ tại phòng trực và không được tiếp khách sau 22:00.',
      details:
        'Students must not bring outsiders into the dormitory to stay without approval from dormitory management.',
      details_en:
        'Students must not bring outsiders into the dormitory to stay without approval from dormitory management.',
      details_vi:
        'Sinh viên không được đưa người ngoài vào ở KTX khi chưa được sự đồng ý của cán bộ quản lý KTX.',
      keywords: ['guest', 'visitor', 'friend visit', 'bring friend', 'outsider', 'overnight guest'],
      keywords_en: [
        'guest',
        'visitor',
        'friend visit',
        'bring friend',
        'outsider',
        'overnight guest',
      ],
      keywords_vi: [
        'khách',
        'người ngoài',
        'bạn đến chơi',
        'ngủ qua đêm',
        'tiếp khách',
        'chứa chấp',
      ],
      example_questions_en: [
        'Can my friend visit me in the dorm?',
        'Can someone stay overnight?',
        'What are the guest rules?',
      ],
      example_questions_vi: [
        'Bạn em vào KTX chơi được không?',
        'Có được cho người ngoài ngủ lại không?',
        'Quy định tiếp khách ở KTX là gì?',
      ],
      penalty: {
        fine_vnd: 1000000,
        description: 'Bringing an outsider into the dormitory without management approval.',
        description_en: 'Bringing an outsider into the dormitory without management approval.',
        description_vi: 'Đưa người lạ vào KTX khi chưa được sự đồng ý của cán bộ quản lý KTX.',
        first_violation_en:
          'Administrative fine for the hosting student and the outsider must leave the dormitory immediately.',
        first_violation_vi:
          'Phạt hành chính người chứa chấp và yêu cầu người ngoài rời KTX ngay lập tức.',
        repeat_penalty_en: 'Dormitory service termination.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX.',
      },
    },
    {
      id: 'KTX-SEMESTER-CHECKOUT-RENEWAL',
      category: 'finance',
      source_ref: 'Điều 1.5; Phụ lục dòng 19, 21',
      title: 'Semester renewal and checkout',
      title_en: 'Semester renewal and checkout',
      title_vi: 'Gia hạn ở tiếp và trả phòng cuối kỳ',
      rule: 'At the end of each semester, residents must either check out and return the room or register and pay for the next semester.',
      rule_en:
        'At the end of each semester, residents must either check out and return the room or register and pay for the next semester.',
      rule_vi:
        'Cuối mỗi học kỳ, sinh viên đang ở KTX phải check-out trả phòng hoặc đăng ký và nộp phí cho học kỳ sau.',
      details:
        'Students who do not continue staying must complete checkout before the 30th day of the final month of the semester.',
      details_en:
        'Students who do not continue staying must complete checkout before the 30th day of the final month of the semester.',
      details_vi:
        'Sinh viên không đăng ký ở tiếp phải làm thủ tục check-out trước ngày 30 của tháng cuối học kỳ.',
      keywords: ['checkout', 'renew dorm', 'next semester', 'register to stay', 'late checkout'],
      keywords_en: ['checkout', 'renew dorm', 'next semester', 'register to stay', 'late checkout'],
      keywords_vi: ['check-out', 'trả phòng', 'ở tiếp', 'đăng ký kỳ sau', 'cuối học kỳ'],
      example_questions_en: [
        'When do I need to check out?',
        'How do I continue staying next semester?',
        'What happens if I do not register for next semester?',
      ],
      example_questions_vi: [
        'Khi nào phải check-out KTX?',
        'Muốn ở tiếp kỳ sau thì làm gì?',
        'Không đăng ký ở tiếp có bị phạt không?',
      ],
      penalty: {
        fine_vnd: 1000000,
        description_en: 'Staying without registration.',
        description_vi: 'Sinh viên ở mà không đăng ký.',
        additional_action_en:
          'Student must also pay the stay fee up to the violation date at 20,000 VND per day.',
        additional_action_vi:
          'Sinh viên phải nộp thêm tiền ở đến ngày vi phạm với mức 20.000đ/ngày.',
        amount_en:
          'Late checkout: 50% of the next semester dormitory fee plus the stay fee until checkout.',
        amount_vi: 'Check-out muộn: 50% tiền ở kỳ sau và tiền ở đến ngày làm check-out.',
      },
    },
    {
      id: 'KTX-FEE-DEADLINES',
      category: 'finance',
      source_ref: 'Điều 1.6; Phụ lục dòng 20',
      title: 'Dormitory fee deadlines',
      title_en: 'Dormitory fee deadlines',
      title_vi: 'Thời hạn nộp phí KTX',
      rule: 'Students who continue staying must pay dormitory fees no later than one week before the new semester starts.',
      rule_en:
        'Students who continue staying must pay dormitory fees no later than one week before the new semester starts.',
      rule_vi:
        'Sinh viên ở tiếp có trách nhiệm nộp phí KTX chậm nhất 01 tuần trước khi học kỳ bắt đầu.',
      details:
        'Additional electricity and water fees must be paid by the final day of the first week of the new semester.',
      details_en:
        'Additional electricity and water fees must be paid by the final day of the first week of the new semester.',
      details_vi:
        'Phí phụ trội điện, nước phải nộp muộn nhất vào ngày cuối cùng trong 01 tuần đầu tiên của học kỳ mới.',
      keywords: ['dorm fee', 'late payment', 'electricity water fee', 'payment deadline'],
      keywords_en: ['dorm fee', 'late payment', 'electricity water fee', 'payment deadline'],
      keywords_vi: ['phí KTX', 'nộp tiền muộn', 'tiền điện nước', 'hạn nộp phí'],
      example_questions_en: [
        'When is the dorm fee due?',
        'What is the penalty for late dorm payment?',
      ],
      example_questions_vi: ['Khi nào phải nộp phí KTX?', 'Nộp tiền KTX muộn bị phạt bao nhiêu?'],
      penalty: {
        fine_vnd: 20000,
        description_en: 'Late dormitory fee payment.',
        description_vi: 'Sinh viên nộp tiền KTX muộn.',
        note_en:
          'The fine is charged per late day. The deadline is 7 days before the new semester.',
        note_vi: 'Mức phạt tính theo mỗi ngày muộn. Thời hạn là trước học kỳ mới 7 ngày.',
      },
    },
    {
      id: 'KTX-NO-REFUND',
      category: 'finance',
      source_ref: 'Điều 1.7',
      title: 'No refund for mid-semester cancellation or termination',
      title_en: 'No refund for mid-semester cancellation or termination',
      title_vi: 'Không hoàn phí khi hủy phòng giữa kỳ hoặc bị chấm dứt dịch vụ',
      rule: 'Students who cancel their room mid-semester or have dormitory service terminated due to violations are not refunded dormitory fees.',
      rule_en:
        'Students who cancel their room mid-semester or have dormitory service terminated due to violations are not refunded dormitory fees.',
      rule_vi:
        'Sinh viên hủy phòng giữa kỳ hoặc bị chấm dứt dịch vụ KTX do vi phạm Nội quy KTX không được hoàn lại phí.',
      keywords: ['refund', 'cancel room', 'terminate dorm service', 'mid-semester cancellation'],
      keywords_en: ['refund', 'cancel room', 'terminate dorm service', 'mid-semester cancellation'],
      keywords_vi: ['hoàn phí', 'hủy phòng', 'chấm dứt dịch vụ', 'giữa kỳ'],
      example_questions_en: [
        'Can I get a refund if I cancel my dorm room?',
        'Will I get money back if I am expelled from the dorm?',
      ],
      example_questions_vi: [
        'Hủy phòng giữa kỳ có được hoàn phí không?',
        'Bị chấm dứt dịch vụ KTX có được hoàn tiền không?',
      ],
    },
    {
      id: 'KTX-ROOM-CHANGE',
      category: 'room_management',
      source_ref: 'Điều 1.9; Phụ lục dòng 17',
      title: 'Changing rooms or beds without permission',
      title_en: 'Changing rooms or beds without permission',
      title_vi: 'Tự ý đổi chỗ ở',
      rule: 'Students are not allowed to change rooms or beds without permission from dormitory management.',
      rule_en:
        'Students are not allowed to change rooms or beds without permission from dormitory management.',
      rule_vi: 'Sinh viên không được tự ý đổi chỗ ở khi chưa được cán bộ quản lý KTX cho phép.',
      details: 'Unauthorized room or bed swaps must be reversed when requested by management.',
      details_en: 'Unauthorized room or bed swaps must be reversed when requested by management.',
      details_vi: 'Trường hợp tự ý đổi chỗ ở phải trở về chỗ cũ khi cán bộ quản lý yêu cầu.',
      keywords: ['change room', 'switch room', 'move bed', 'swap room', 'change bed'],
      keywords_en: ['change room', 'switch room', 'move bed', 'swap room', 'change bed'],
      keywords_vi: ['đổi phòng', 'chuyển phòng', 'đổi giường', 'đổi chỗ ở', 'hoán đổi phòng'],
      example_questions_en: ['Can I change my dorm room?', 'Can I swap rooms with a friend?'],
      example_questions_vi: ['Em đổi phòng được không?', 'Có được đổi giường với bạn không?'],
      penalty: {
        fine_vnd: 1000000,
        first_violation_en: 'Administrative fine and required return to the original place.',
        first_violation_vi: 'Phạt hành chính và yêu cầu về chỗ cũ.',
        repeat_penalty_en: 'Dormitory service termination.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX.',
      },
    },
    {
      id: 'KTX-ROOM-VISITS-AFTER-2230',
      category: 'room_management',
      source_ref: 'Điều 1.10; Phụ lục dòng 15, 16',
      title: 'Room visits after 22:30',
      title_en: 'Room visits after 22:30',
      title_vi: 'Sang phòng khác sau 22:30',
      rule: 'Students must not go to another dormitory room or host students from another room after 22:30.',
      rule_en:
        'Students must not go to another dormitory room or host students from another room after 22:30.',
      rule_vi:
        'Sinh viên không được sang phòng khác hoặc chứa chấp người từ phòng khác sang sau 22:30.',
      keywords: ['visit another room', 'after 22:30', 'host roommate', 'sleep in another room'],
      keywords_en: ['visit another room', 'after 22:30', 'host roommate', 'sleep in another room'],
      keywords_vi: ['sang phòng khác', 'sau 22:30', 'chứa chấp', 'qua phòng bạn'],
      example_questions_en: [
        'Can I go to my friend room after 22:30?',
        'Can someone from another room stay in my room late at night?',
      ],
      example_questions_vi: [
        'Sau 22:30 có được sang phòng bạn không?',
        'Chứa bạn phòng khác sau 22:30 bị phạt không?',
      ],
      penalty: {
        fine_vnd: 500000,
        first_violation_en: 'Reminder.',
        first_violation_vi: 'Nhắc nhở.',
        second_violation_en: 'Administrative fine.',
        second_violation_vi: 'Phạt hành chính.',
        third_violation_en: 'Dormitory service termination.',
        third_violation_vi: 'Ngừng cung cấp dịch vụ KTX.',
      },
    },
    {
      id: 'KTX-ROOM-TRANSFER-LEASE',
      category: 'room_management',
      source_ref: 'Điều 1.11',
      title: 'No room transfer or sublease',
      title_en: 'No room transfer or sublease',
      title_vi: 'Không chuyển nhượng hoặc cho thuê lại phòng ở',
      rule: 'Students must not transfer or sublease their dormitory room.',
      rule_en: 'Students must not transfer or sublease their dormitory room.',
      rule_vi: 'Sinh viên không được chuyển nhượng hoặc cho thuê lại phòng ở.',
      keywords: ['sublease', 'rent out room', 'transfer room', 'lend room'],
      keywords_en: ['sublease', 'rent out room', 'transfer room', 'lend room'],
      keywords_vi: ['cho thuê lại', 'chuyển nhượng phòng', 'cho mượn phòng'],
      example_questions_en: [
        'Can I rent my dorm place to someone else?',
        'Can I transfer my room to another student?',
      ],
      example_questions_vi: [
        'Có được cho thuê lại phòng KTX không?',
        'Em chuyển nhượng phòng cho bạn được không?',
      ],
    },
    {
      id: 'KTX-PARTIES',
      category: 'living_rules',
      source_ref: 'Điều 1.12',
      title: 'Parties and group activities',
      title_en: 'Parties and group activities',
      title_vi: 'Tổ chức sinh nhật, liên hoan và hoạt động vui chơi',
      rule: 'Students must not organize birthday parties, gatherings, eating events, or recreational activities in the dormitory without management approval.',
      rule_en:
        'Students must not organize birthday parties, gatherings, eating events, or recreational activities in the dormitory without management approval.',
      rule_vi:
        'Sinh viên không được tự ý tổ chức tiệc sinh nhật, liên hoan hay các hoạt động ăn uống vui chơi trong KTX khi không được cán bộ quản lý KTX đồng ý.',
      keywords: ['party', 'birthday', 'gathering', 'celebration', 'group activity'],
      keywords_en: ['party', 'birthday', 'gathering', 'celebration', 'group activity'],
      keywords_vi: ['tiệc sinh nhật', 'liên hoan', 'ăn uống', 'vui chơi', 'tổ chức tiệc'],
      example_questions_en: [
        'Can we have a birthday party in the dorm?',
        'Can my room organize a gathering?',
      ],
      example_questions_vi: [
        'Có được tổ chức sinh nhật trong KTX không?',
        'Phòng em liên hoan được không?',
      ],
    },
    {
      id: 'KTX-RESPECT-STAFF-RESIDENTS',
      category: 'security',
      source_ref: 'Điều 1.13; Phụ lục dòng 23',
      title: 'Respectful conduct toward staff and residents',
      title_en: 'Respectful conduct toward staff and residents',
      title_vi: 'Thái độ ứng xử với cán bộ và người ở KTX',
      rule: 'Students must be polite to staff and security, respect other residents, and must not insult, threaten, or provoke others.',
      rule_en:
        'Students must be polite to staff and security, respect other residents, and must not insult, threaten, or provoke others.',
      rule_vi:
        'Sinh viên phải lễ phép, lịch sự với cán bộ, bảo vệ quản lý KTX, hòa nhã, tôn trọng bạn bè, không vô lễ, gây gổ hoặc đe dọa người khác.',
      keywords: ['staff', 'security', 'insult', 'threaten', 'disrespect', 'argue'],
      keywords_en: ['staff', 'security', 'insult', 'threaten', 'disrespect', 'argue'],
      keywords_vi: ['cán bộ', 'bảo vệ', 'vô lễ', 'đe dọa', 'chống đối', 'gây gổ'],
      example_questions_en: [
        'What happens if I insult dorm staff?',
        'Can I refuse security instructions?',
      ],
      example_questions_vi: [
        'Vô lễ với cán bộ KTX bị xử lý thế nào?',
        'Chống đối bảo vệ có bị đuổi khỏi KTX không?',
      ],
      penalty: {
        amount_en: 'Dormitory service refusal or termination.',
        amount_vi: 'Từ chối cung cấp dịch vụ KTX.',
        additional_action_en:
          'Case is transferred to the school for handling under student regulations.',
        additional_action_vi: 'Bàn giao cho nhà trường xử lý theo Nội quy sinh viên.',
      },
    },
    {
      id: 'KTX-INSPECTION-COOPERATION',
      category: 'security',
      source_ref: 'Điều 1.14; Điều 8.3',
      title: 'Administrative inspection cooperation',
      title_en: 'Administrative inspection cooperation',
      title_vi: 'Hợp tác khi kiểm tra hành chính',
      rule: 'Students must cooperate when dormitory staff or security conduct administrative checks or handle security and order incidents.',
      rule_en:
        'Students must cooperate when dormitory staff or security conduct administrative checks or handle security and order incidents.',
      rule_vi:
        'Sinh viên có trách nhiệm hợp tác khi cán bộ và bảo vệ quản lý KTX cần kiểm tra hành chính hay xử lý các trường hợp gây mất an ninh trật tự.',
      details:
        'Dormitory functional staff and authorized police may inspect rooms at any time. If a room is occupied but no one opens the door, staff on duty may open the door to enter.',
      details_en:
        'Dormitory functional staff and authorized police may inspect rooms at any time. If a room is occupied but no one opens the door, staff on duty may open the door to enter.',
      details_vi:
        'Cán bộ chức năng của KTX và cơ quan công an được phép kiểm tra phòng ở bất kỳ thời điểm nào. Nếu phòng có người nhưng không mở cửa, cán bộ đang thi hành nhiệm vụ được phép mở cửa để vào.',
      keywords: ['inspection', 'security check', 'open door', 'administrative check', 'police'],
      keywords_en: ['inspection', 'security check', 'open door', 'administrative check', 'police'],
      keywords_vi: ['kiểm tra hành chính', 'kiểm tra phòng', 'mở cửa', 'công an', 'bảo vệ'],
      example_questions_en: [
        'Can dorm staff inspect my room?',
        'Do I have to open the door for inspection?',
      ],
      example_questions_vi: [
        'Cán bộ KTX có được kiểm tra phòng không?',
        'Không mở cửa khi kiểm tra thì sao?',
      ],
    },
    {
      id: 'KTX-GAMBLING',
      category: 'living_rules',
      source_ref: 'Điều 2.1; Phụ lục dòng 11',
      title: 'Gambling',
      title_en: 'Gambling',
      title_vi: 'Đánh bạc',
      rule: 'Organizing or participating in gambling in the dormitory is prohibited in all forms.',
      rule_en:
        'Organizing or participating in gambling in the dormitory is prohibited in all forms.',
      rule_vi: 'Cấm tổ chức, tham gia đánh bạc trong KTX dưới mọi hình thức.',
      keywords: ['gambling', 'betting', 'cards for money'],
      keywords_en: ['gambling', 'betting', 'cards for money'],
      keywords_vi: ['đánh bạc', 'cá cược', 'chơi bài ăn tiền'],
      example_questions_en: [
        'Is gambling allowed in the dorm?',
        'What is the penalty for gambling?',
      ],
      example_questions_vi: [
        'Đánh bạc trong KTX bị phạt bao nhiêu?',
        'Chơi bài ăn tiền có được không?',
      ],
      penalty: {
        fine_vnd: 200000,
        description_en:
          'Fine applies per participant if the violation has not reached criminal prosecution level.',
        description_vi:
          'Mức phạt áp dụng cho mỗi người tham gia nếu chưa đến mức truy tố trước pháp luật.',
        first_violation_en: 'Administrative fine for participants.',
        first_violation_vi: 'Phạt hành chính những người tham gia.',
        repeat_penalty_en: 'Dormitory service termination.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX.',
      },
    },
    {
      id: 'KTX-SMOKING-ALCOHOL',
      category: 'living_rules',
      source_ref: 'Điều 2.2; Phụ lục dòng 2',
      title: 'Smoking, alcohol, and tobacco products',
      title_en: 'Smoking, alcohol, and tobacco products',
      title_vi: 'Thuốc lá, thuốc lào, thuốc lá điện tử và đồ uống có cồn',
      rule: 'Producing, using, or storing alcohol, tobacco, e-cigarettes, pipe tobacco, or being drunk and out of control in the dormitory is prohibited.',
      rule_en:
        'Producing, using, or storing alcohol, tobacco, e-cigarettes, pipe tobacco, or being drunk and out of control in the dormitory is prohibited.',
      rule_vi:
        'Cấm sản xuất, sử dụng và tàng trữ trong KTX các loại đồ uống có cồn, thuốc lá, thuốc lá điện tử, thuốc lào hoặc ở trong tình trạng say rượu bia mất kiểm soát.',
      keywords: ['smoking', 'cigarette', 'vape', 'e-cigarette', 'alcohol', 'beer', 'drunk'],
      keywords_en: ['smoking', 'cigarette', 'vape', 'e-cigarette', 'alcohol', 'beer', 'drunk'],
      keywords_vi: [
        'hút thuốc',
        'thuốc lá',
        'thuốc lào',
        'thuốc điện tử',
        'vape',
        'rượu',
        'bia',
        'say rượu',
      ],
      example_questions_en: [
        'Can I smoke in the dorm?',
        'Is alcohol allowed in the dorm?',
        'Are e-cigarettes allowed?',
      ],
      example_questions_vi: [
        'Có được hút thuốc trong KTX không?',
        'Uống rượu bia trong KTX có bị phạt không?',
        'Vape có được phép không?',
      ],
      penalty: {
        fine_vnd: 500000,
        first_violation_en: 'Confiscation of violating items and administrative fine.',
        first_violation_vi: 'Tịch thu các vật dụng vi phạm và xử phạt hành chính.',
        repeat_penalty_en: 'Dormitory service termination.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX.',
      },
    },
    {
      id: 'KTX-DRUGS-LAUGHING-GAS',
      category: 'living_rules',
      source_ref: 'Điều 2.2; Phụ lục dòng 3',
      title: 'Drugs, laughing gas, and illegal substances',
      title_en: 'Drugs, laughing gas, and illegal substances',
      title_vi: 'Ma túy, bóng cười và chất cấm',
      rule: 'Storing, trading, or using drugs, laughing gas, narcotic-derived products, or other legally prohibited items in the dormitory is strictly forbidden.',
      rule_en:
        'Storing, trading, or using drugs, laughing gas, narcotic-derived products, or other legally prohibited items in the dormitory is strictly forbidden.',
      rule_vi:
        'Cấm tàng trữ, mua bán, sử dụng ma túy, bóng cười, chế phẩm từ ma túy và các vật phẩm pháp luật cấm sử dụng, phát tán, buôn bán trong KTX.',
      keywords: ['drug', 'narcotic', 'laughing gas', 'illegal substance', 'nitrous oxide'],
      keywords_en: ['drug', 'narcotic', 'laughing gas', 'illegal substance', 'nitrous oxide'],
      keywords_vi: ['ma túy', 'bóng cười', 'chất cấm', 'chế phẩm ma túy'],
      example_questions_en: [
        'What happens for drug possession in the dorm?',
        'Is laughing gas allowed?',
      ],
      example_questions_vi: [
        'Tàng trữ ma túy trong KTX bị xử lý thế nào?',
        'Bóng cười có được phép không?',
      ],
      penalty: {
        amount_en: 'Dormitory service termination.',
        amount_vi: 'Ngừng cung cấp dịch vụ KTX.',
        legal_action_en: 'Handled under student regulations and applicable law.',
        legal_action_vi: 'Xử lý theo nội quy sinh viên và pháp luật hiện hành.',
      },
    },
    {
      id: 'KTX-COOKING',
      category: 'living_rules',
      source_ref: 'Điều 2.3; Phụ lục dòng 5',
      title: 'Cooking in the dormitory',
      title_en: 'Cooking in the dormitory',
      title_vi: 'Nấu ăn trong KTX',
      rule: 'Cooking in the dormitory and bringing or using cooking equipment in the dormitory are prohibited.',
      rule_en:
        'Cooking in the dormitory and bringing or using cooking equipment in the dormitory are prohibited.',
      rule_vi: 'Cấm mang và sử dụng các loại bếp, dụng cụ để nấu ăn trong KTX.',
      details: 'This includes stoves, hot plates, hot pot equipment, and similar cooking devices.',
      details_en:
        'This includes stoves, hot plates, hot pot equipment, and similar cooking devices.',
      details_vi:
        'Quy định áp dụng với các loại bếp, dụng cụ nấu ăn, nồi lẩu và thiết bị tương tự.',
      keywords: ['cook', 'cooking', 'stove', 'hot plate', 'hot pot', 'food preparation'],
      keywords_en: ['cook', 'cooking', 'stove', 'hot plate', 'hot pot', 'food preparation'],
      keywords_vi: ['nấu ăn', 'bếp', 'nồi lẩu', 'dụng cụ nấu ăn', 'bếp điện'],
      example_questions_en: [
        'Can I cook in my dorm room?',
        'Is hotpot allowed in the dorm?',
        'Can I use a stove in my room?',
      ],
      example_questions_vi: [
        'Có được nấu ăn trong KTX không?',
        'Nấu lẩu trong phòng có bị phạt không?',
        'Có được dùng bếp điện không?',
      ],
      penalty: {
        fine_vnd: 500000,
        first_violation_en: 'Administrative fine.',
        first_violation_vi: 'Phạt hành chính.',
        repeat_penalty_en: 'Dormitory service termination.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX.',
      },
    },
    {
      id: 'KTX-UNAUTHORIZED-ITEMS',
      category: 'equipment',
      source_ref: 'Phụ lục dòng 1',
      title: 'Unauthorized items',
      title_en: 'Unauthorized items',
      title_vi: 'Vật dụng không được phép',
      rule: 'Students must not bring items outside the allowed dormitory item list into the dormitory.',
      rule_en:
        'Students must not bring items outside the allowed dormitory item list into the dormitory.',
      rule_vi: 'Sinh viên không được mang vật dụng không được phép trong danh mục vào KTX.',
      keywords: ['unauthorized item', 'banned item', 'not allowed item', 'confiscated item'],
      keywords_en: ['unauthorized item', 'banned item', 'not allowed item', 'confiscated item'],
      keywords_vi: ['vật dụng không được phép', 'đồ cấm', 'danh mục cấm', 'tịch thu'],
      example_questions_en: [
        'What happens if I bring banned items?',
        'Can dorm staff confiscate unauthorized items?',
      ],
      example_questions_vi: [
        'Mang vật dụng không được phép bị phạt bao nhiêu?',
        'Đồ cấm có bị tịch thu không?',
      ],
      penalty: {
        fine_vnd: 500000,
        additional_action_en: 'Unauthorized items are confiscated.',
        additional_action_vi: 'Tịch thu các vật dụng trái phép.',
      },
    },
    {
      id: 'KTX-ELECTRICAL-CONNECTIONS',
      category: 'equipment',
      source_ref: 'Điều 2.4',
      title: 'Electrical connections and heavy simultaneous usage',
      title_en: 'Electrical connections and heavy simultaneous usage',
      title_vi: 'Tự ý đấu nối và dùng nhiều thiết bị điện cùng lúc',
      rule: 'Students must not connect electrical equipment without permission and should limit using many electrical devices at the same time.',
      rule_en:
        'Students must not connect electrical equipment without permission and should limit using many electrical devices at the same time.',
      rule_vi:
        'Cấm tự ý đấu nối các thiết bị điện và hạn chế sử dụng nhiều thiết bị điện trong cùng một thời điểm.',
      keywords: ['electric connection', 'electrical device', 'power overload', 'plug', 'wire'],
      keywords_en: ['electric connection', 'electrical device', 'power overload', 'plug', 'wire'],
      keywords_vi: ['đấu nối điện', 'thiết bị điện', 'quá tải điện', 'ổ cắm', 'dây điện'],
      example_questions_en: [
        'Can I install my own electrical wiring?',
        'Can I use many appliances at once?',
      ],
      example_questions_vi: [
        'Có được tự đấu nối điện không?',
        'Dùng nhiều thiết bị điện cùng lúc có được không?',
      ],
    },
    {
      id: 'KTX-PETS',
      category: 'living_rules',
      source_ref: 'Điều 2.5; Phụ lục dòng 9',
      title: 'Keeping pets or animals',
      title_en: 'Keeping pets or animals',
      title_vi: 'Nuôi thú trong phòng ở',
      rule: 'Students are not allowed to keep birds, animals, or pets in the dormitory.',
      rule_en: 'Students are not allowed to keep birds, animals, or pets in the dormitory.',
      rule_vi: 'Cấm nuôi các loại chim, thú cảnh trong KTX.',
      keywords: ['pet', 'dog', 'cat', 'animal', 'bird'],
      keywords_en: ['pet', 'dog', 'cat', 'animal', 'bird'],
      keywords_vi: ['thú cưng', 'chó', 'mèo', 'động vật', 'chim cảnh', 'nuôi thú'],
      example_questions_en: ['Can I keep a cat in my dorm?', 'Are pets allowed in the dorm?'],
      example_questions_vi: [
        'Có được nuôi mèo trong KTX không?',
        'Nuôi thú cưng trong phòng bị phạt không?',
      ],
      penalty: {
        fine_vnd: 500000,
        first_violation_en: 'Administrative fine.',
        first_violation_vi: 'Phạt hành chính.',
        repeat_penalty_en: 'Dormitory service termination.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX.',
      },
    },
    {
      id: 'KTX-POSTERS-ADVERTISEMENT',
      category: 'living_rules',
      source_ref: 'Điều 2.6',
      title: 'Posters, advertising, and unlawful content',
      title_en: 'Posters, advertising, and unlawful content',
      title_vi: 'Tuyên truyền, quảng cáo và dán áp phích',
      rule: 'Students must not spread, advertise, write, or draw content against the law, and must not post posters, banners, slogans, or advertising without management permission.',
      rule_en:
        'Students must not spread, advertise, write, or draw content against the law, and must not post posters, banners, slogans, or advertising without management permission.',
      rule_vi:
        'Cấm tuyên truyền, quảng cáo, viết, vẽ nội dung trái quy định pháp luật; không được dán áp phích, băng rôn, biểu ngữ, quảng cáo khi chưa được cán bộ quản lý KTX cho phép.',
      keywords: ['poster', 'banner', 'advertisement', 'slogan', 'illegal content'],
      keywords_en: ['poster', 'banner', 'advertisement', 'slogan', 'illegal content'],
      keywords_vi: ['áp phích', 'băng rôn', 'biểu ngữ', 'quảng cáo', 'nội dung trái pháp luật'],
      example_questions_en: [
        'Can I put posters in the dorm?',
        'Can I advertise something in the dorm hallway?',
      ],
      example_questions_vi: [
        'Có được dán poster trong KTX không?',
        'Dán quảng cáo ở KTX có cần xin phép không?',
      ],
    },
    {
      id: 'KTX-ELECTRICITY-WATER',
      category: 'equipment',
      source_ref: 'Điều 2.7',
      title: 'Turning off electricity and water',
      title_en: 'Turning off electricity and water',
      title_vi: 'Tắt thiết bị điện, nước khi không sử dụng',
      rule: 'Students must turn off electrical and water devices when leaving the room or when there is no need to use them.',
      rule_en:
        'Students must turn off electrical and water devices when leaving the room or when there is no need to use them.',
      rule_vi: 'Tắt các thiết bị điện, nước khi ra khỏi phòng hay khi không có nhu cầu sử dụng.',
      keywords: ['turn off electricity', 'turn off water', 'save electricity', 'save water'],
      keywords_en: ['turn off electricity', 'turn off water', 'save electricity', 'save water'],
      keywords_vi: ['tắt điện', 'tắt nước', 'tiết kiệm điện', 'tiết kiệm nước'],
      example_questions_en: [
        'Do I need to turn off electricity when leaving?',
        'What are the electricity and water rules?',
      ],
      example_questions_vi: [
        'Ra khỏi phòng có phải tắt điện không?',
        'Quy định về điện nước là gì?',
      ],
    },
    {
      id: 'KTX-NOISE',
      category: 'security',
      source_ref: 'Điều 3.2; Phụ lục dòng 13',
      title: 'Noise and disturbance',
      title_en: 'Noise and disturbance',
      title_vi: 'Làm ồn, mất trật tự',
      rule: 'Students must not make noise or disturb other residents.',
      rule_en: 'Students must not make noise or disturb other residents.',
      rule_vi: 'Không gây ồn ào ảnh hưởng đến người khác.',
      keywords: ['noise', 'party', 'loud music', 'disturbance', 'quiet'],
      keywords_en: ['noise', 'party', 'loud music', 'disturbance', 'quiet'],
      keywords_vi: ['ồn ào', 'gây ồn', 'mở nhạc to', 'mất trật tự', 'ảnh hưởng người khác'],
      example_questions_en: ['Is loud music allowed?', 'What is the penalty for making noise?'],
      example_questions_vi: ['Mở nhạc to trong KTX bị phạt không?', 'Làm ồn bị phạt bao nhiêu?'],
      penalty: {
        fine_vnd: 200000,
        description_en: 'Fine applies per person.',
        description_vi: 'Mức phạt áp dụng cho mỗi người.',
        additional_action_en: 'Electricity and water may be cut until the rules are followed.',
        additional_action_vi: 'Có thể bị cắt điện, nước cho đến khi thực hiện đúng nội quy.',
      },
    },
    {
      id: 'KTX-FIGHTING-WEAPONS',
      category: 'security',
      source_ref: 'Điều 3.1, Điều 3.2; Phụ lục dòng 22',
      title: 'Fighting, provocation, and weapons',
      title_en: 'Fighting, provocation, and weapons',
      title_vi: 'Gây gổ, đánh nhau, kích động đánh nhau và vũ khí',
      rule: 'Students must not fight, provoke fights, bring weapons, or cause security and order problems in the dormitory.',
      rule_en:
        'Students must not fight, provoke fights, bring weapons, or cause security and order problems in the dormitory.',
      rule_vi:
        'Không gây gổ, đánh nhau hoặc kích động đánh nhau; không đem vũ khí gây mất an ninh trật tự trong KTX.',
      keywords: ['fight', 'weapon', 'violence', 'provoke fight', 'security disorder'],
      keywords_en: ['fight', 'weapon', 'violence', 'provoke fight', 'security disorder'],
      keywords_vi: ['đánh nhau', 'gây gổ', 'kích động', 'vũ khí', 'mất an ninh trật tự'],
      example_questions_en: [
        'What happens if students fight in the dorm?',
        'Are weapons allowed in the dorm?',
      ],
      example_questions_vi: [
        'Đánh nhau trong KTX bị xử lý thế nào?',
        'Mang vũ khí vào KTX có được không?',
      ],
      penalty: {
        amount_en: 'Dormitory service refusal or termination.',
        amount_vi: 'Từ chối cung cấp dịch vụ KTX.',
        additional_action_en:
          'Case is transferred to the school for handling under student regulations.',
        additional_action_vi: 'Bàn giao cho nhà trường xử lý theo Nội quy sinh viên.',
      },
    },
    {
      id: 'KTX-CLIMBING',
      category: 'safety',
      source_ref: 'Điều 3.3; Phụ lục dòng 6',
      title: 'Climbing fences, balconies, or rooftops',
      title_en: 'Climbing fences, balconies, or rooftops',
      title_vi: 'Leo trèo hàng rào, ban công, sân thượng',
      rule: 'Students must not climb fences, balconies, or rooftops.',
      rule_en: 'Students must not climb fences, balconies, or rooftops.',
      rule_vi: 'Không leo trèo hàng rào, ban công, sân thượng.',
      keywords: ['climb', 'fence', 'balcony', 'rooftop', 'safety'],
      keywords_en: ['climb', 'fence', 'balcony', 'rooftop', 'safety'],
      keywords_vi: ['leo trèo', 'hàng rào', 'ban công', 'sân thượng', 'an toàn'],
      example_questions_en: [
        'Can I climb over the dorm fence?',
        'What is the penalty for climbing the balcony?',
      ],
      example_questions_vi: ['Leo hàng rào KTX bị phạt bao nhiêu?', 'Có được leo ban công không?'],
      penalty: {
        fine_vnd: 200000,
        first_violation_en: 'Warning and administrative fine.',
        first_violation_vi: 'Cảnh cáo, xử phạt hành chính.',
        repeat_penalty_en: 'Dormitory service termination.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX.',
      },
    },
    {
      id: 'KTX-LOCK-DOORS',
      category: 'security',
      source_ref: 'Điều 3.4',
      title: 'Locking room doors',
      title_en: 'Locking room doors',
      title_vi: 'Khóa cửa phòng',
      rule: 'Students must carefully lock the door when leaving the room.',
      rule_en: 'Students must carefully lock the door when leaving the room.',
      rule_vi: 'Khóa cửa cẩn thận khi ra khỏi phòng.',
      keywords: ['lock door', 'room security', 'leave room'],
      keywords_en: ['lock door', 'room security', 'leave room'],
      keywords_vi: ['khóa cửa', 'an ninh phòng', 'ra khỏi phòng'],
      example_questions_en: [
        'Do I need to lock my room when leaving?',
        'What are the room security rules?',
      ],
      example_questions_vi: [
        'Ra khỏi phòng có phải khóa cửa không?',
        'Quy định khóa cửa phòng là gì?',
      ],
    },
    {
      id: 'KTX-FIRE-SAFETY',
      category: 'safety',
      source_ref: 'Điều 4.1, Điều 4.2; Phụ lục dòng 4',
      title: 'Fire safety and flammable materials',
      title_en: 'Fire safety and flammable materials',
      title_vi: 'An toàn PCCC và chất dễ cháy nổ',
      rule: 'Students must not bring flammable or explosive materials such as gasoline, oil, gas cylinders, alcohol, or explosives into the dormitory.',
      rule_en:
        'Students must not bring flammable or explosive materials such as gasoline, oil, gas cylinders, alcohol, or explosives into the dormitory.',
      rule_vi:
        'Cấm đem chất dễ gây cháy nổ vào KTX như xăng, dầu, gas, chất nổ, cồn và các vật dụng dễ gây cháy nổ.',
      details:
        'Students must comply with state fire prevention regulations and the university fire safety rules.',
      details_en:
        'Students must comply with state fire prevention regulations and the university fire safety rules.',
      details_vi:
        'Sinh viên phải nghiêm chỉnh chấp hành và tuân thủ các quy định về PCCC của nhà nước và nhà trường.',
      keywords: [
        'fire safety',
        'flammable',
        'gas',
        'fuel',
        'gasoline',
        'explosive',
        'alcohol fuel',
      ],
      keywords_en: [
        'fire safety',
        'flammable',
        'gas',
        'fuel',
        'gasoline',
        'explosive',
        'alcohol fuel',
      ],
      keywords_vi: [
        'phòng cháy',
        'chữa cháy',
        'chất dễ cháy',
        'bình gas',
        'xăng dầu',
        'chất nổ',
        'cồn',
      ],
      example_questions_en: [
        'Can I bring gas into the dorm?',
        'What items are banned for fire safety?',
      ],
      example_questions_vi: [
        'Có được mang bình gas vào KTX không?',
        'Những vật dụng nào bị cấm vì PCCC?',
      ],
      penalty: {
        fine_vnd: 500000,
        first_violation_en: 'Confiscation of violating items and administrative fine.',
        first_violation_vi: 'Tịch thu vật dụng vi phạm và xử phạt hành chính.',
        repeat_penalty_en: 'Dormitory service termination.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX.',
        legal_action_en:
          'High-risk or state-banned items may be transferred to competent authorities for handling.',
        legal_action_vi:
          'Vật dụng có nguy cơ cao hoặc thuộc danh mục cấm có thể bị bàn giao cho cơ quan chức năng xử lý.',
      },
    },
    {
      id: 'KTX-FIRE-EQUIPMENT',
      category: 'safety',
      source_ref: 'Điều 4.3; Phụ lục dòng 25',
      title: 'Fire alarms and fire extinguishing equipment',
      title_en: 'Fire alarms and fire extinguishing equipment',
      title_vi: 'Thiết bị báo cháy và chữa cháy',
      rule: 'Students must not activate emergency fire alarms or use fire extinguishers, fire cabinets, or firefighting equipment without a fire or permission.',
      rule_en:
        'Students must not activate emergency fire alarms or use fire extinguishers, fire cabinets, or firefighting equipment without a fire or permission.',
      rule_vi:
        'Nghiêm cấm tự ý gạt cần báo cháy khẩn cấp, tự ý mở bình cứu hỏa và tủ chữa cháy khi không có cháy hoặc khi chưa được phép.',
      keywords: [
        'fire alarm',
        'fire extinguisher',
        'fire cabinet',
        'false alarm',
        'fire equipment',
      ],
      keywords_en: [
        'fire alarm',
        'fire extinguisher',
        'fire cabinet',
        'false alarm',
        'fire equipment',
      ],
      keywords_vi: [
        'báo cháy',
        'bình cứu hỏa',
        'tủ chữa cháy',
        'gạt cần báo cháy',
        'thiết bị chữa cháy',
      ],
      example_questions_en: [
        'What happens if I pull the fire alarm as a joke?',
        'Can I use the fire extinguisher without a fire?',
      ],
      example_questions_vi: [
        'Tự ý gạt báo cháy bị phạt bao nhiêu?',
        'Dùng bình chữa cháy sai mục đích bị xử lý thế nào?',
      ],
      penalty: {
        fine_vnd: 500000,
        first_violation_en: 'Administrative fine and compensation for damage, if any.',
        first_violation_vi: 'Phạt hành chính và đền bù thiệt hại nếu có.',
        repeat_penalty_en: 'Dormitory service termination and compensation for damage, if any.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX và đền bù thiệt hại nếu có.',
      },
    },
    {
      id: 'KTX-FIRE-INCIDENT-REPORTING',
      category: 'safety',
      source_ref: 'Điều 4.4',
      title: 'Responding to fire incidents',
      title_en: 'Responding to fire incidents',
      title_vi: 'Xử lý khi phát hiện cháy hoặc bất thường',
      rule: 'When detecting an abnormal situation or fire, students should stay calm, try to extinguish it safely with suitable equipment, and immediately report to dormitory staff or security.',
      rule_en:
        'When detecting an abnormal situation or fire, students should stay calm, try to extinguish it safely with suitable equipment, and immediately report to dormitory staff or security.',
      rule_vi:
        'Khi phát hiện bất thường hoặc có cháy xảy ra, sinh viên cần bình tĩnh tự dập tắt nếu có thể, sử dụng phương tiện chữa cháy chuyên dùng và báo cho cán bộ, bảo vệ KTX.',
      details:
        'For serious cases, call the professional fire prevention and fighting force at 114.',
      details_en:
        'For serious cases, call the professional fire prevention and fighting force at 114.',
      details_vi:
        'Trường hợp nghiêm trọng cần báo cho lực lượng PCCC chuyên nghiệp qua số điện thoại 114.',
      keywords: ['fire', 'emergency', 'call 114', 'report fire', 'fire incident'],
      keywords_en: ['fire', 'emergency', 'call 114', 'report fire', 'fire incident'],
      keywords_vi: ['cháy', 'hỏa hoạn', 'báo cháy', 'gọi 114', 'sự cố PCCC'],
      example_questions_en: [
        'What should I do if there is a fire?',
        'What number should I call for fire emergency?',
      ],
      example_questions_vi: ['Có cháy trong KTX thì làm gì?', 'Số điện thoại PCCC là bao nhiêu?'],
    },
    {
      id: 'KTX-ALLOWED-DEVICES',
      category: 'equipment',
      source_ref: 'Điều 5.2',
      title: 'Allowed electrical devices',
      title_en: 'Allowed electrical devices',
      title_vi: 'Thiết bị điện được mang vào KTX',
      rule: 'Students may bring only listed electrical devices into the dormitory room unless management approves other devices.',
      rule_en:
        'Students may bring only listed electrical devices into the dormitory room unless management approves other devices.',
      rule_vi:
        'Sinh viên chỉ được mang các thiết bị điện trong danh mục vào KTX; thiết bị khác phải được cán bộ quản lý KTX đồng ý.',
      allowed_devices: [
        'electric fan',
        'iron',
        'electric kettle',
        'study lamp',
        'refrigerator under 110L per room',
      ],
      allowed_devices_en: [
        'electric fan',
        'iron',
        'electric kettle',
        'study lamp',
        'refrigerator under 110L per room',
      ],
      allowed_devices_vi: [
        'quạt điện',
        'bàn ủi',
        'ấm đun nước',
        'đèn học',
        'tủ lạnh có dung tích dưới 110L/phòng',
      ],
      keywords: [
        'electronics',
        'devices',
        'allowed appliances',
        'refrigerator',
        'kettle',
        'iron',
        'fan',
      ],
      keywords_en: [
        'electronics',
        'devices',
        'allowed appliances',
        'refrigerator',
        'kettle',
        'iron',
        'fan',
      ],
      keywords_vi: [
        'thiết bị điện',
        'đồ điện',
        'được mang',
        'tủ lạnh',
        'ấm đun nước',
        'bàn ủi',
        'quạt điện',
      ],
      example_questions_en: [
        'What electrical devices can I bring?',
        'Can I bring a refrigerator?',
        'Can I bring an electric kettle?',
      ],
      example_questions_vi: [
        'Em được mang thiết bị điện nào vào KTX?',
        'Có được mang tủ lạnh không?',
        'Ấm đun nước có được phép không?',
      ],
    },
    {
      id: 'KTX-ASSET-HANDOVER',
      category: 'equipment',
      source_ref: 'Điều 5.1',
      title: 'Room handover and asset condition',
      title_en: 'Room handover and asset condition',
      title_vi: 'Bàn giao phòng và tài sản khi kết thúc nội trú',
      rule: 'When ending their dormitory stay, students must hand over the room with assets intact and the room clean.',
      rule_en:
        'When ending their dormitory stay, students must hand over the room with assets intact and the room clean.',
      rule_vi:
        'Khi kết thúc thời gian nội trú, sinh viên có trách nhiệm bàn giao phòng ở đảm bảo nguyên vẹn tài sản và vệ sinh sạch sẽ cho cán bộ quản lý KTX.',
      keywords: ['handover', 'return room', 'asset condition', 'clean room', 'checkout'],
      keywords_en: ['handover', 'return room', 'asset condition', 'clean room', 'checkout'],
      keywords_vi: [
        'bàn giao phòng',
        'trả phòng',
        'nguyên vẹn tài sản',
        'vệ sinh sạch sẽ',
        'check-out',
      ],
      example_questions_en: [
        'What condition should my room be in when checking out?',
        'Do I need to clean my room before handover?',
      ],
      example_questions_vi: [
        'Check-out phải bàn giao phòng như thế nào?',
        'Trả phòng có cần dọn sạch không?',
      ],
    },
    {
      id: 'KTX-ROOM-MODIFICATION-ASSETS',
      category: 'equipment',
      source_ref: 'Điều 5.3, Điều 5.4',
      title: 'Room modification and moving shared assets',
      title_en: 'Room modification and moving shared assets',
      title_vi: 'Tự ý sửa chữa, cải tạo phòng và di chuyển tài sản chung',
      rule: 'Students must not repair, renovate, change the original room structure, move shared assets from assigned positions, or add equipment outside the rules without approval.',
      rule_en:
        'Students must not repair, renovate, change the original room structure, move shared assets from assigned positions, or add equipment outside the rules without approval.',
      rule_vi:
        'Sinh viên không được tự ý sửa chữa, cải tạo, làm thay đổi kết cấu ban đầu phòng ở, di chuyển tài sản chung khỏi vị trí đã định hoặc tự ý gắn thêm trang thiết bị ngoài quy định.',
      keywords: [
        'renovate room',
        'repair room',
        'move furniture',
        'shared assets',
        'install equipment',
      ],
      keywords_en: [
        'renovate room',
        'repair room',
        'move furniture',
        'shared assets',
        'install equipment',
      ],
      keywords_vi: [
        'sửa chữa phòng',
        'cải tạo phòng',
        'di chuyển tài sản',
        'tài sản chung',
        'gắn thiết bị',
      ],
      example_questions_en: [
        'Can I move dorm furniture?',
        'Can I install extra equipment in my room?',
      ],
      example_questions_vi: [
        'Có được tự ý sửa phòng không?',
        'Di chuyển tài sản chung có được không?',
      ],
    },
    {
      id: 'KTX-WALL-DAMAGE',
      category: 'equipment',
      source_ref: 'Điều 5.5; Phụ lục dòng 12',
      title: 'Writing, drawing, pasting, or nailing on dorm property',
      title_en: 'Writing, drawing, pasting, or nailing on dorm property',
      title_vi: 'Viết, vẽ, dán giấy, đóng đinh sai quy định',
      rule: 'Students must not write, draw, paste paper, hammer nails, or hang items improperly on beds, wardrobes, walls, rooms, or public areas.',
      rule_en:
        'Students must not write, draw, paste paper, hammer nails, or hang items improperly on beds, wardrobes, walls, rooms, or public areas.',
      rule_vi:
        'Không viết, vẽ, dán giấy, đóng đinh, treo sai chức năng các vật dụng lên giường, tủ, tường, phòng ở và khu vực công cộng.',
      keywords: ['write on wall', 'draw on wall', 'poster on wall', 'nail wall', 'damage wall'],
      keywords_en: ['write on wall', 'draw on wall', 'poster on wall', 'nail wall', 'damage wall'],
      keywords_vi: ['viết lên tường', 'vẽ lên tường', 'dán giấy', 'đóng đinh', 'treo đồ sai'],
      example_questions_en: [
        'Can I nail something to the wall?',
        'What is the penalty for drawing on the wall?',
      ],
      example_questions_vi: [
        'Đóng đinh lên tường bị phạt bao nhiêu?',
        'Dán giấy lên tủ có được không?',
      ],
      penalty: {
        fine_vnd: 100000,
        additional_action_en: 'Student must also pay repair or restoration costs.',
        additional_action_vi: 'Kèm theo giá trị sửa chữa, khắc phục.',
      },
    },
    {
      id: 'KTX-THEFT-DAMAGE',
      category: 'security',
      source_ref: 'Điều 5.6, Điều 5.7; Phụ lục dòng 24',
      title: 'Personal belongings, theft, and damage',
      title_en: 'Personal belongings, theft, and damage',
      title_vi: 'Tư trang cá nhân, phá hoại, trộm cắp và làm hư hỏng tài sản',
      rule: 'Students are responsible for their personal belongings and must not destroy or steal public property or other people property.',
      rule_en:
        'Students are responsible for their personal belongings and must not destroy or steal public property or other people property.',
      rule_vi:
        'Sinh viên tự bảo quản tư trang cá nhân; cấm phá hoại, trộm cắp của công và tài sản của người khác.',
      details:
        'Students who damage shared dormitory assets or equipment must compensate for the damage.',
      details_en:
        'Students who damage shared dormitory assets or equipment must compensate for the damage.',
      details_vi:
        'Sinh viên làm hư hỏng tài sản, thiết bị chung của KTX phải có trách nhiệm bồi thường.',
      keywords: [
        'theft',
        'steal',
        'damage property',
        'break equipment',
        'personal belongings',
        'compensation',
      ],
      keywords_en: [
        'theft',
        'steal',
        'damage property',
        'break equipment',
        'personal belongings',
        'compensation',
      ],
      keywords_vi: ['trộm cắp', 'phá hoại', 'làm hỏng tài sản', 'tư trang cá nhân', 'bồi thường'],
      example_questions_en: [
        'What happens if I damage dorm property?',
        'What is the penalty for stealing in the dorm?',
      ],
      example_questions_vi: [
        'Làm hỏng tài sản KTX phải bồi thường không?',
        'Trộm cắp trong KTX bị xử lý thế nào?',
      ],
      penalty: {
        compensation_en: 'Compensate for the value of damaged or stolen property.',
        compensation_vi: 'Đền bù giá trị tài sản.',
        additional_action_en: 'Immediate dormitory service termination.',
        additional_action_vi: 'Ngừng cung cấp dịch vụ KTX ngay lập tức.',
        legal_action_en: 'Handled under student regulations.',
        legal_action_vi: 'Xử lý theo Nội quy sinh viên.',
      },
    },
    {
      id: 'KTX-PARKING',
      category: 'general',
      source_ref: 'Điều 5.8',
      title: 'Parking in designated areas',
      title_en: 'Parking in designated areas',
      title_vi: 'Để xe đúng nơi quy định',
      rule: 'Students must park vehicles in designated areas and must not park in front of or behind the dormitory.',
      rule_en:
        'Students must park vehicles in designated areas and must not park in front of or behind the dormitory.',
      rule_vi: 'Để xe đúng nơi quy định, không để xe phía trước và sau KTX.',
      keywords: ['parking', 'vehicle', 'bike', 'motorbike', 'designated area'],
      keywords_en: ['parking', 'vehicle', 'bike', 'motorbike', 'designated area'],
      keywords_vi: ['để xe', 'xe máy', 'xe đạp', 'nơi quy định', 'trước sau KTX'],
      example_questions_en: ['Where can I park my motorbike?', 'Can I park behind the dorm?'],
      example_questions_vi: ['Có được để xe sau KTX không?', 'Xe máy phải để ở đâu?'],
    },
    {
      id: 'KTX-HYGIENE-COMMON-AREAS',
      category: 'hygiene',
      source_ref: 'Điều 6.1; Phụ lục dòng 14',
      title: 'Room and common-area hygiene',
      title_en: 'Room and common-area hygiene',
      title_vi: 'Vệ sinh phòng ở và khu vực sinh hoạt chung',
      rule: 'Students must regularly keep rooms, common living areas, corridors, and balconies clean and tidy.',
      rule_en:
        'Students must regularly keep rooms, common living areas, corridors, and balconies clean and tidy.',
      rule_vi:
        'Thường xuyên giữ gìn phòng ở, sảnh sinh hoạt chung, hành lang, ban công sạch sẽ, gọn gàng.',
      details:
        'Students must not make common areas dirty or leave belongings messy in common living areas, corridors, balconies, or public areas.',
      details_en:
        'Students must not make common areas dirty or leave belongings messy in common living areas, corridors, balconies, or public areas.',
      details_vi:
        'Không làm mất vệ sinh, bày đồ đạc bừa bãi trong khu vực sảnh sinh hoạt chung, hành lang, ban công, khu vực công cộng.',
      keywords: ['hygiene', 'clean room', 'common area', 'corridor', 'balcony', 'messy'],
      keywords_en: ['hygiene', 'clean room', 'common area', 'corridor', 'balcony', 'messy'],
      keywords_vi: [
        'vệ sinh',
        'sạch sẽ',
        'sảnh sinh hoạt chung',
        'hành lang',
        'ban công',
        'bừa bãi',
      ],
      example_questions_en: [
        'What is the hygiene rule for common areas?',
        'What is the fine for making the hallway dirty?',
      ],
      example_questions_vi: [
        'Làm bẩn khu vực chung bị phạt không?',
        'Phòng ở phải giữ vệ sinh như thế nào?',
      ],
      penalty: {
        fine_vnd: 200000,
        description_en: 'Fine applies per person.',
        description_vi: 'Mức phạt áp dụng cho mỗi người.',
        first_violation_en: 'Administrative fine for the room or related individual.',
        first_violation_vi: 'Xử phạt hành chính cả phòng hoặc cá nhân liên quan.',
        repeat_penalty_en: 'Dormitory service termination for the room or related individual.',
        repeat_penalty_vi: 'Ngừng cung cấp dịch vụ KTX cả phòng hoặc cá nhân liên quan.',
      },
    },
    {
      id: 'KTX-TRASH',
      category: 'hygiene',
      source_ref: 'Điều 6.2, Điều 6.4; Phụ lục dòng 8, 26',
      title: 'Trash disposal and blocked drains',
      title_en: 'Trash disposal and blocked drains',
      title_vi: 'Đổ rác, xả rác và gây tắc nghẽn',
      rule: 'Students must not litter and may only dispose of trash at designated collection points. Students must not let trash block toilets, washbasins, or floor drains.',
      rule_en:
        'Students must not litter and may only dispose of trash at designated collection points. Students must not let trash block toilets, washbasins, or floor drains.',
      rule_vi:
        'Không xả rác bừa bãi, chỉ đổ rác tại địa điểm tập kết được quy định; không để rác gây tắc nghẽn bồn cầu, chậu rửa mặt, thoát sàn.',
      keywords: ['trash', 'litter', 'garbage', 'blocked toilet', 'blocked drain', 'washbasin'],
      keywords_en: ['trash', 'litter', 'garbage', 'blocked toilet', 'blocked drain', 'washbasin'],
      keywords_vi: ['rác', 'xả rác', 'đổ rác', 'tắc bồn cầu', 'tắc thoát sàn', 'chậu rửa mặt'],
      example_questions_en: [
        'Where should I throw trash?',
        'What is the penalty for blocking the toilet with trash?',
      ],
      example_questions_vi: [
        'Đổ rác sai nơi quy định bị phạt bao nhiêu?',
        'Để rác gây tắc bồn cầu bị phạt không?',
      ],
      penalty: {
        fine_vnd: 100000,
        description_en: 'Wrong trash disposal or littering is fined per violation.',
        description_vi: 'Đổ rác và xả rác sai quy định bị xử phạt mỗi lần vi phạm.',
        repeat_penalty_en:
          'Repeated trash violations twice may lead to dormitory service termination.',
        repeat_penalty_vi: 'Tái phạm 2 lần sẽ ngừng cung cấp dịch vụ KTX.',
        additional_action_en:
          'If trash blocks a toilet, washbasin, or floor drain, the fine is 500,000 VND plus repair costs.',
        additional_action_vi:
          'Nếu để rác gây tắc nghẽn bồn cầu, chậu rửa mặt hoặc thoát sàn, mức phạt là 500.000đ cộng thêm giá trị sửa chữa.',
      },
    },
    {
      id: 'KTX-BALCONY-LAUNDRY',
      category: 'hygiene',
      source_ref: 'Phụ lục dòng 7',
      title: 'Hanging belongings on balcony railings',
      title_en: 'Hanging belongings on balcony railings',
      title_vi: 'Phơi đồ lên thành ban công',
      rule: 'Students must not hang clothes or belongings on balcony railings in a way that affects dormitory appearance.',
      rule_en:
        'Students must not hang clothes or belongings on balcony railings in a way that affects dormitory appearance.',
      rule_vi: 'Không phơi đồ đạc lên thành ban công gây mất thẩm mỹ.',
      keywords: ['balcony laundry', 'hang clothes', 'balcony railing', 'appearance'],
      keywords_en: ['balcony laundry', 'hang clothes', 'balcony railing', 'appearance'],
      keywords_vi: ['phơi đồ', 'thành ban công', 'mất thẩm mỹ', 'ban công'],
      example_questions_en: [
        'Can I hang clothes on the balcony railing?',
        'What is the penalty for drying clothes on the balcony?',
      ],
      example_questions_vi: [
        'Có được phơi đồ lên thành ban công không?',
        'Phơi đồ ở ban công bị phạt bao nhiêu?',
      ],
      penalty: {
        fine_vnd: 100000,
        description_en: 'Administrative fine for each violation.',
        description_vi: 'Phạt hành chính mỗi lần vi phạm.',
      },
    },
    {
      id: 'KTX-POLLUTION-ODOR',
      category: 'hygiene',
      source_ref: 'Điều 6.3',
      title: 'Odor and environmental pollution',
      title_en: 'Odor and environmental pollution',
      title_vi: 'Chất gây mùi và ô nhiễm môi trường',
      rule: 'Students must not bring substances that cause odor or environmental pollution and affect others into the dormitory.',
      rule_en:
        'Students must not bring substances that cause odor or environmental pollution and affect others into the dormitory.',
      rule_vi: 'Cấm đem các chất gây mùi, gây ô nhiễm môi trường ảnh hưởng đến người khác vào KTX.',
      keywords: ['bad smell', 'odor', 'pollution', 'environment', 'affect others'],
      keywords_en: ['bad smell', 'odor', 'pollution', 'environment', 'affect others'],
      keywords_vi: ['gây mùi', 'mùi hôi', 'ô nhiễm môi trường', 'ảnh hưởng người khác'],
      example_questions_en: [
        'Can I bring strong-smelling substances into the dorm?',
        'What are the odor rules?',
      ],
      example_questions_vi: [
        'Mang đồ gây mùi vào KTX có được không?',
        'Chất gây ô nhiễm có bị cấm không?',
      ],
    },
    {
      id: 'KTX-HEALTH-DISEASE',
      category: 'health',
      source_ref: 'Điều 7.1-7.4',
      title: 'Health and disease prevention',
      title_en: 'Health and disease prevention',
      title_vi: 'Y tế và phòng dịch',
      rule: 'Students must report disease risks or abnormal health symptoms to dormitory management or the medical office for timely prevention and treatment guidance.',
      rule_en:
        'Students must report disease risks or abnormal health symptoms to dormitory management or the medical office for timely prevention and treatment guidance.',
      rule_vi:
        'Khi có nguy cơ xảy ra dịch bệnh hoặc phát hiện dịch bệnh, sinh viên phải báo ngay cho cán bộ quản lý KTX hoặc Phòng Y tế; sinh viên có biểu hiện bất thường về sức khỏe phải tới Phòng Y tế để được hướng dẫn, điều trị.',
      details:
        'Students who notice friends or others with abnormal health symptoms must notify staff or help bring that person to the medical office.',
      details_en:
        'Students who notice friends or others with abnormal health symptoms must notify staff or help bring that person to the medical office.',
      details_vi:
        'Sinh viên thấy bạn bè hoặc người khác có biểu hiện bất thường về sức khỏe phải thông báo hoặc giúp đưa người đó đến Phòng Y tế.',
      keywords: ['health', 'medical office', 'disease', 'symptoms', 'sick', 'epidemic'],
      keywords_en: ['health', 'medical office', 'disease', 'symptoms', 'sick', 'epidemic'],
      keywords_vi: [
        'y tế',
        'phòng dịch',
        'dịch bệnh',
        'sức khỏe bất thường',
        'bị bệnh',
        'Phòng Y tế',
      ],
      example_questions_en: [
        'What should I do if I feel sick in the dorm?',
        'Who should I report disease symptoms to?',
      ],
      example_questions_vi: [
        'Bị bệnh trong KTX thì báo ai?',
        'Phát hiện bạn có dấu hiệu bệnh thì làm gì?',
      ],
    },
    {
      id: 'KTX-VIOLATION-HANDLING',
      category: 'general',
      source_ref: 'Điều 8.1, Điều 8.2, Điều 8.4; Phụ lục dòng 27',
      title: 'Violation handling framework',
      title_en: 'Violation handling framework',
      title_vi: 'Khung xử lý vi phạm',
      rule: 'All residents must strictly follow dormitory regulations. Violations may result in reminders, reports, reprimands, warnings, administrative fines, compensation, stronger school discipline, legal handling, or dormitory service termination.',
      rule_en:
        'All residents must strictly follow dormitory regulations. Violations may result in reminders, reports, reprimands, warnings, administrative fines, compensation, stronger school discipline, legal handling, or dormitory service termination.',
      rule_vi:
        'Tất cả sinh viên lưu trú trong KTX phải chấp hành nghiêm túc nội quy. Vi phạm có thể bị nhắc nhở, lập biên bản, khiển trách, cảnh cáo, phạt hành chính, đền bù thiệt hại, kỷ luật cao hơn theo quy định của nhà trường và pháp luật, hoặc ngừng cung cấp dịch vụ KTX.',
      details:
        'Other conduct not specifically listed is handled under FPT High School and FPT University regulations where applicable.',
      details_en:
        'Other conduct not specifically listed is handled under FPT High School and FPT University regulations where applicable.',
      details_vi:
        'Các hành vi khác được xử lý theo Nội quy trường THPT FPT và Trường Đại học FPT khi áp dụng.',
      keywords: [
        'violation handling',
        'discipline',
        'fine',
        'warning',
        'termination',
        'other violations',
      ],
      keywords_en: [
        'violation handling',
        'discipline',
        'fine',
        'warning',
        'termination',
        'other violations',
      ],
      keywords_vi: [
        'xử lý vi phạm',
        'kỷ luật',
        'phạt hành chính',
        'cảnh cáo',
        'ngừng dịch vụ',
        'hành vi khác',
      ],
      example_questions_en: [
        'How are dorm violations handled?',
        'What happens for violations not listed?',
      ],
      example_questions_vi: [
        'Vi phạm nội quy KTX bị xử lý thế nào?',
        'Hành vi khác không có trong bảng phạt thì sao?',
      ],
      penalty: {
        amount_en: 'Handled under applicable FPT student and school regulations.',
        amount_vi: 'Xử lý theo Nội quy trường THPT FPT và Trường Đại học FPT.',
      },
    },
  ],
  system_instructions: {
    assistant_role: 'Dormitory assistant for FPT University Hoa Hai Campus students.',
    response_rules: [
      'Use only the knowledge base rules.',
      'Answer in the same language as the student when possible.',
      'Use rule_en for English answers and rule_vi for Vietnamese answers.',
      'If a rule is violated, explain the penalty and escalation details.',
      'Mention that information is not found when the knowledge base does not cover the question.',
    ],
  },
};

module.exports = dormRulesKnowledgeBase;
