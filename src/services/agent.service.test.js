/* global jest, describe, beforeEach, it, expect */

jest.mock('./openai.service', () => ({
  stream: jest.fn(),
}));

jest.mock('./booking.service', () => ({
  getBookingWindowStatus: jest.fn(),
  getNextSemesterInfo: jest.fn(),
  getAvailableRoomTypes: jest.fn(),
}));

jest.mock('./dormRules.service', () => ({
  getDormRulesKnowledgeBase: jest.fn(),
  queryRules: jest.fn(),
}));

jest.mock('./ewUsage.service', () => ({
  getMyEWUsages: jest.fn(),
}));

jest.mock('../models', () => ({
  Student: {
    findOne: jest.fn(),
  },
}));

const bookingService = require('./booking.service');
const dormRulesService = require('./dormRules.service');
const ewUsageService = require('./ewUsage.service');
const { Student } = require('../models');
const agentService = require('./agent.service');

const collectStream = (stream$) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream$.subscribe({
      next: (chunk) => chunks.push(chunk),
      error: reject,
      complete: () => resolve(chunks),
    });
  });

const getMeta = (chunks, type) => chunks.find((chunk) => chunk?.meta?.type === type)?.meta;

describe('agentService scoped assistant intents', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    bookingService.getBookingWindowStatus.mockResolvedValue({ allowed: true });
    bookingService.getNextSemesterInfo.mockResolvedValue({ semester: 'Fall-2026' });
    bookingService.getAvailableRoomTypes.mockResolvedValue([
      {
        room_type: '4_bed',
        available_slots: 2,
        price_per_semester: 1000000,
      },
    ]);

    dormRulesService.getDormRulesKnowledgeBase.mockResolvedValue({ rules: [] });
    dormRulesService.queryRules.mockResolvedValue({ answer: '**Dorm rules**' });

    Student.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'student-1',
        student_code: 'SE001',
        full_name: 'Student One',
        behavioral_score: 8,
        violations_current_semester: 0,
      }),
    });
  });

  it('returns latest-month utility metadata from ewUsageService', async () => {
    ewUsageService.getMyEWUsages.mockResolvedValue({
      block_name: 'Block A',
      room_number: '101',
      data: [
        {
          id: 'electric-latest',
          term: 'Spring-2026',
          date: '2026-04-30T00:00:00.000Z',
          type: 'electric',
          meter_left: 100,
          meter_right: 130,
          consumption: 30,
          unit: 'kW',
          price_per_unit: 3000,
          occupied_beds: 4,
          billing_students: 4,
          billing_days: 30,
          total_student_days: 120,
          student_days: 30,
          total_amount: 90000,
          amount: 22500,
        },
        {
          id: 'water-latest',
          term: 'Spring-2026',
          date: '2026-04-30T00:00:00.000Z',
          type: 'water',
          meter_left: 20,
          meter_right: 25,
          consumption: 5,
          unit: 'm3',
          price_per_unit: 9000,
          occupied_beds: 4,
          total_amount: 45000,
          amount: 11250,
        },
        {
          id: 'old-record',
          date: '2026-03-31T00:00:00.000Z',
          type: 'electric',
          consumption: 10,
          unit: 'kW',
          amount: 7500,
          total_amount: 30000,
        },
      ],
    });

    const chunks = await collectStream(
      await agentService.answer({ question: 'Show my utility readings' }, 'user-1')
    );
    const meta = getMeta(chunks, 'utility_summary');

    expect(ewUsageService.getMyEWUsages).toHaveBeenCalledWith('user-1');
    expect(meta.has_data).toBe(true);
    expect(meta.room.label).toBe('Block A · Room 101');
    expect(meta.utility.latest_month_key).toBe('2026-04');
    expect(meta.utility.records).toHaveLength(2);
    expect(meta.utility.total_amount).toBe(33750);
    expect(meta.utility.records.map((record) => record.id)).not.toContain('old-record');
  });

  it('returns empty utility metadata when the student has no active room', async () => {
    ewUsageService.getMyEWUsages.mockResolvedValue({
      block_name: null,
      room_number: null,
      data: [],
      message: 'No active room assignment found',
    });

    const chunks = await collectStream(
      await agentService.answer({ question: 'Check utility readings' }, 'user-1')
    );
    const meta = getMeta(chunks, 'utility_summary');

    expect(meta.has_data).toBe(false);
    expect(meta.room).toBeNull();
  });

  it('routes CFD explanation questions to Dorm manager handoff', async () => {
    const chunks = await collectStream(
      await agentService.answer({ question: 'What does CFD score mean?' }, 'user-1')
    );
    const meta = getMeta(chunks, 'manager_handoff');

    expect(meta.topic).toBe('cfd');
    expect(meta.chat_path).toBe('/student/chat');
  });

  it('routes utility calculation questions to Dorm manager handoff', async () => {
    const chunks = await collectStream(
      await agentService.answer({ question: 'How is utility calculated?' }, 'user-1')
    );
    const meta = getMeta(chunks, 'manager_handoff');

    expect(meta.topic).toBe('utility');
    expect(meta.chat_path).toBe('/student/chat');
  });

  it('keeps conduct summary lookup in the scoped conduct flow', async () => {
    const chunks = await collectStream(
      await agentService.answer({ question: 'Show my conduct summary' }, 'user-1')
    );
    const meta = getMeta(chunks, 'conduct_summary');

    expect(meta.behavioral_score).toBe(8);
    expect(meta.violations_current_semester).toBe(0);
  });

  it('keeps dorm rules questions in the dorm rules flow', async () => {
    const chunks = await collectStream(
      await agentService.answer({ question: 'What are the dorm rules?' }, 'user-1')
    );

    expect(dormRulesService.getDormRulesKnowledgeBase).not.toHaveBeenCalled();
    expect(dormRulesService.queryRules).toHaveBeenCalledWith('What are the dorm rules?');
    expect(chunks.map((chunk) => chunk.content).join('')).toContain('Dorm rules');
  });

  it('keeps bed booking requests in the booking flow', async () => {
    const chunks = await collectStream(
      await agentService.answer({ question: 'I want to book a bed' }, 'user-1')
    );
    const meta = getMeta(chunks, 'booking_options');

    expect(meta.step).toBe('room_type');
    expect(meta.options).toHaveLength(1);
  });
});
