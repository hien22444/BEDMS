jest.mock('../models', () => ({
  FaceEmbedding: {
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
  },
  Student: {
    findById: jest.fn(),
    find: jest.fn(),
  },
  StudentAccessLog: {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock('../config/cloudinary', () => ({
  uploadBase64Image: jest.fn(),
}));

jest.mock('./internalAuth.service', () => ({
  getFaceServiceAuthHeaders: jest.fn(() => ({
    Authorization: 'Bearer test-token',
  })),
}));

const { FaceEmbedding, Student } = require('../models');
const faceRecognitionService = require('./faceRecognition.service');

describe('faceRecognitionService FaceService auth forwarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();

    Student.findById.mockResolvedValue({
      _id: 'student-1',
      student_code: 'SE0001',
      full_name: 'Student One',
    });

    FaceEmbedding.findOneAndUpdate.mockResolvedValue({
      _id: 'embedding-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const lean = jest.fn().mockResolvedValue([]);
    const populateStudent = jest.fn().mockReturnValue({ lean });
    FaceEmbedding.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean,
      }),
    });
    Student.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean }),
    });
  });

  it('adds the bearer token when registering a face with FaceService', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        embedding: new Array(512).fill(0.1),
        quality_score: 0.92,
        face_crop_base64: 'abc123',
      }),
    });

    await faceRecognitionService.registerFace('student-1', Buffer.from('image'), 'manager-1');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/register'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });
});
