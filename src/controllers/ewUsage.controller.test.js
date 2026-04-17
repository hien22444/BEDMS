/* global jest, describe, beforeEach, it, expect */

jest.mock('../services');

const { status } = require('http-status');
const { ewUsageService } = require('../services');
const ewUsageController = require('./ewUsage.controller');

describe('EW Usage controller', () => {
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();
  });

  it('should quick-create an EW usage record successfully', async () => {
    const mockReq = {
      body: {
        block: 'block-1',
        type: 'electric',
        meter_increment: 10,
      },
    };

    const mockRes = {
      success: jest.fn(),
    };

    const mockRecord = {
      id: 'ew-1',
      block_name: 'A101',
      type: 'electric',
      meter_right: 120,
      term: 'Fall-2026',
    };

    ewUsageService.quickCreateEWUsage.mockResolvedValue(mockRecord);

    ewUsageController.quickCreateEWUsage(mockReq, mockRes, mockNext);
    await new Promise((resolve) => process.nextTick(resolve));

    expect(ewUsageService.quickCreateEWUsage).toHaveBeenCalledWith(mockReq.body);
    expect(mockRes.success).toHaveBeenCalledWith(mockRecord, status.CREATED);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
