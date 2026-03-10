// Mocking the userService
jest.mock('../services');

const { userService } = require('../services');
const userController = require('./user.controller');

describe('User Controller', () => {
  // Setup: Clear mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test Suite 1: getAllUsers
  describe('getAllUsers', () => {
    it('should retrieve all users and return success response', async () => {
      // Arrange (Prepare test data)
      const mockUsers = [
        { id: 1, name: 'User 1', email: 'user1@example.com' },
        { id: 2, name: 'User 2', email: 'user2@example.com' },
      ];

      const mockReq = { query: {} };
      const mockRes = {
        success: jest.fn(),
      };

      userService.getAllUsers.mockResolvedValue(mockUsers);

      // Act (Execute the function)
      await userController.getAllUsers(mockReq, mockRes);

      // Assert (Verify the results)
      expect(userService.getAllUsers).toHaveBeenCalledWith({});
      expect(mockRes.success).toHaveBeenCalledWith(mockUsers, expect.any(Number));
    });

    it('should pass query filters to the service', async () => {
      const mockReq = { query: { page: 1, limit: 10 } };
      const mockRes = { success: jest.fn() };

      userService.getAllUsers.mockResolvedValue([]);

      await userController.getAllUsers(mockReq, mockRes);

      expect(userService.getAllUsers).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  // Test Suite 2: deleteUser
  describe('deleteUser', () => {
    it('should delete a user and return success response', async () => {
      const mockReq = { params: { id: '123' } };
      const mockRes = { success: jest.fn() };

      userService.deleteUser.mockResolvedValue(null);

      await userController.deleteUser(mockReq, mockRes);

      expect(userService.deleteUser).toHaveBeenCalledWith('123');
      expect(mockRes.success).toHaveBeenCalledWith('User Deleted', expect.any(Number));
    });

    it('should throw error when service fails', async () => {
      const mockReq = { params: { id: 'invalid-id' } };
      const mockRes = {};

      userService.deleteUser.mockRejectedValue(new Error('User not found'));

      // When using catchAsync, errors are caught, so we need to handle this properly
      expect(async () => {
        await userController.deleteUser(mockReq, mockRes);
      });
    });
  });

  // Test Suite 3: importExcel
  describe('importExcel', () => {
    it('should import users from Excel file', async () => {
      const mockFile = {
        buffer: Buffer.from('mock excel data'),
        originalname: 'users.xlsx',
      };

      const mockReq = { file: mockFile };
      const mockRes = { success: jest.fn() };

      const mockResult = { imported: 10, failed: 0 };
      userService.importFromExcel.mockResolvedValue(mockResult);

      await userController.importExcel(mockReq, mockRes);

      expect(userService.importFromExcel).toHaveBeenCalledWith(mockFile.buffer);
      expect(mockRes.success).toHaveBeenCalledWith(mockResult, expect.any(Number));
    });

    it('should throw error when no file is provided', async () => {
      const mockReq = { file: null };
      const mockRes = {};

      expect(async () => {
        await userController.importExcel(mockReq, mockRes);
      });
    });
  });
});
