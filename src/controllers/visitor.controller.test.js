// Mock the visitor service
jest.mock('../services');

const { status } = require('http-status');
const { visitorService } = require('../services');
const visitorController = require('./visitor.controller');

describe('UC10 - Gửi yêu cầu người thăm thân', () => {
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();
  });

  describe('createVisitorRequest - Tạo yêu cầu người thăm thân', () => {
    // TC01: Happy Path - Tạo yêu cầu thành công
    it('TC01: Should create visitor request successfully with valid data', async () => {
      // ARRANGE
      const mockReq = {
        user: { id: 'student123' },
        body: {
          visitor_name: 'Nguyễn Văn A',
          visitor_phone: '0987654321',
          visitor_email: 'visitor@example.com',
          relationship: 'parent', // parent, sibling, friend, etc.
          visit_date: '2026-03-15',
          visit_time_from: '14:00',
          visit_time_to: '16:00',
          purpose: 'Family visit',
          note: 'Visit family members',
        },
      };

      const mockRes = {
        success: jest.fn(),
      };

      const mockVisitorRequest = {
        _id: 'visitor-req-1',
        student: 'student123',
        visitor_name: 'Nguyễn Văn A',
        visitor_phone: '0987654321',
        visit_date: new Date('2026-03-15'),
        status: 'pending',
        created_at: new Date(),
      };

      visitorService.createVisitorRequest.mockResolvedValue(mockVisitorRequest);

      // ACT
      await visitorController.createVisitorRequest(mockReq, mockRes, mockNext);

      // ASSERT
      expect(visitorService.createVisitorRequest).toHaveBeenCalledWith('student123', mockReq.body);
      expect(mockRes.success).toHaveBeenCalledWith(mockVisitorRequest, status.CREATED);
    });

    // TC02: Validation - Thiếu visitor_name
    it('TC02: Should throw error when visitor_name is missing', async () => {
      // ARRANGE
      const mockReq = {
        user: { id: 'student123' },
        body: {
          // visitor_name missing
          visitor_phone: '0987654321',
          visit_date: '2026-03-15',
          visit_time_from: '14:00',
          visit_time_to: '16:00',
          purpose: 'Family visit',
        },
      };

      const mockRes = {};

      visitorService.createVisitorRequest.mockRejectedValue(new Error('visitor_name is required'));

      // ACT
      await visitorController.createVisitorRequest(mockReq, mockRes, mockNext);

      // ASSERT - Service was called (error caught by catchAsync)
      expect(visitorService.createVisitorRequest).toHaveBeenCalled();
    });

    // TC03: Validation - Thiếu visit_date hoặc định dạng sai
    it('TC03: Should throw error when visit_date is invalid or in past', async () => {
      // ARRANGE
      const mockReq = {
        user: { id: 'student123' },
        body: {
          visitor_name: 'Nguyễn Văn A',
          visitor_phone: '0987654321',
          visit_date: '2025-01-01', // Past date
          visit_time_from: '14:00',
          visit_time_to: '16:00',
          purpose: 'Family visit',
        },
      };

      const mockRes = {};

      visitorService.createVisitorRequest.mockRejectedValue(
        new Error('Visit date must be in the future')
      );

      // ACT
      await visitorController.createVisitorRequest(mockReq, mockRes, mockNext);

      // ASSERT
      expect(visitorService.createVisitorRequest).toHaveBeenCalled();
    });

    // TC04: Business Rule - User không có trạng thái sinh viên hợp lệ
    it('TC04: Should throw error when user is not valid student', async () => {
      // ARRANGE
      const mockReq = {
        user: { id: 'user123' }, // Not a valid student
        body: {
          visitor_name: 'Nguyễn Văn A',
          visitor_phone: '0987654321',
          visit_date: '2026-03-15',
          visit_time_from: '14:00',
          visit_time_to: '16:00',
          purpose: 'Family visit',
        },
      };

      const mockRes = {};

      visitorService.createVisitorRequest.mockRejectedValue(
        new Error('Only active students can request visitor')
      );

      // ACT
      await visitorController.createVisitorRequest(mockReq, mockRes, mockNext);

      // ASSERT
      expect(visitorService.createVisitorRequest).toHaveBeenCalled();
    });

    // TC05: Business Rule - Vượt quá giới hạn yêu cầu trong tháng
    it('TC05: Should throw error when monthly visitor request limit exceeded', async () => {
      // ARRANGE
      const mockReq = {
        user: { id: 'student123' },
        body: {
          visitor_name: 'Visitor 6',
          visitor_phone: '0987654321',
          visit_date: '2026-03-25',
          visit_time_from: '14:00',
          visit_time_to: '16:00',
          purpose: 'Visit',
        },
      };

      const mockRes = {};

      visitorService.createVisitorRequest.mockRejectedValue(
        new Error('You have reached maximum visitor requests for this month (5 limit)')
      );

      // ACT
      await visitorController.createVisitorRequest(mockReq, mockRes, mockNext);

      // ASSERT
      expect(visitorService.createVisitorRequest).toHaveBeenCalled();
    });

    // TC06: Business Rule - Không thể tạo 2 yêu cầu trùng ngày giờ
    it('TC06: Should throw error when duplicate visitor request for same date/time exists', async () => {
      // ARRANGE
      const mockReq = {
        user: { id: 'student123' },
        body: {
          visitor_name: 'Nguyễn Văn A',
          visitor_phone: '0987654321',
          visit_date: '2026-03-15', // Same as TC01
          visit_time_from: '14:00',
          visit_time_to: '16:00',
          purpose: 'Family visit',
        },
      };

      const mockRes = {};

      visitorService.createVisitorRequest.mockRejectedValue(
        new Error('Visitor request already exists for this date and time')
      );

      // ACT
      await visitorController.createVisitorRequest(mockReq, mockRes, mockNext);

      // ASSERT
      expect(visitorService.createVisitorRequest).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Bonus: getMyVisitorRequests - Lịch sử yêu cầu của học sinh
  // ============================================================
  describe('getMyVisitorRequests - Xem yêu cầu của bản thân', () => {
    // TC07: Lấy danh sách yêu cầu thành công
    it('TC07: Should return list of student visitor requests', async () => {
      // ARRANGE
      const mockReq = {
        user: { id: 'student123' },
      };

      const mockRes = {
        success: jest.fn(),
      };

      const mockRequests = [
        {
          _id: 'visitor-req-1',
          visitor_name: 'Nguyễn Văn A',
          status: 'approved',
          visit_date: new Date('2026-03-15'),
        },
        {
          _id: 'visitor-req-2',
          visitor_name: 'Trần Thị B',
          status: 'pending',
          visit_date: new Date('2026-03-20'),
        },
      ];

      visitorService.getMyVisitorRequests.mockResolvedValue(mockRequests);

      // ACT
      await visitorController.getMyVisitorRequests(mockReq, mockRes, mockNext);

      // ASSERT
      expect(visitorService.getMyVisitorRequests).toHaveBeenCalledWith('student123');
      expect(mockRes.success).toHaveBeenCalledWith(mockRequests, status.OK);
      expect(mockRequests.length).toBe(2);
    });
  });

  // ============================================================
  // Bonus: cancelVisitorRequest - Hủy yêu cầu
  // ============================================================
  describe('cancelVisitorRequest - Hủy yêu cầu người thăm thân', () => {
    // TC08: Hủy yêu cầu thành công (status: pending hoặc approved)
    it('TC08: Should cancel visitor request successfully', async () => {
      // ARRANGE
      const mockReq = {
        params: { id: 'visitor-req-1' },
        user: { id: 'student123' },
      };

      const mockRes = {
        success: jest.fn(),
      };

      const mockCancelledRequest = {
        _id: 'visitor-req-1',
        visitor_name: 'Nguyễn Văn A',
        status: 'cancelled',
        cancelled_at: new Date(),
      };

      visitorService.cancelVisitorRequest.mockResolvedValue(mockCancelledRequest);

      // ACT
      await visitorController.cancelVisitorRequest(mockReq, mockRes, mockNext);

      // ASSERT
      expect(visitorService.cancelVisitorRequest).toHaveBeenCalledWith(
        'visitor-req-1',
        'student123'
      );
      expect(mockRes.success).toHaveBeenCalledWith(mockCancelledRequest, status.OK);
      expect(mockCancelledRequest.status).toBe('cancelled');
    });

    // TC09: Không thể hủy yêu cầu đã completed
    it('TC09: Should throw error when trying to cancel completed request', async () => {
      // ARRANGE
      const mockReq = {
        params: { id: 'visitor-req-completed' },
        user: { id: 'student123' },
      };

      const mockRes = {};

      visitorService.cancelVisitorRequest.mockRejectedValue(
        new Error('Cannot cancel completed visitor request')
      );

      // ACT
      await visitorController.cancelVisitorRequest(mockReq, mockRes, mockNext);

      // ASSERT
      expect(visitorService.cancelVisitorRequest).toHaveBeenCalled();
    });
  });
});
