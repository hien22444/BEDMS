jest.mock('../services', () => ({
  internalAuthService: {
    getFaceServiceJwks: jest.fn(() => ({
      keys: [
        {
          kty: 'RSA',
          alg: 'RS256',
          use: 'sig',
          kid: 'test-key-id',
          n: 'abc',
          e: 'AQAB',
        },
      ],
    })),
  },
}));

const { internalAuthService } = require('../services');
const internalAuthController = require('./internalAuth.controller');

describe('internalAuthController', () => {
  it('returns a raw JWKS document', async () => {
    const mockReq = {};
    const mockRes = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await internalAuthController.getJwks(mockReq, mockRes);

    expect(internalAuthService.getFaceServiceJwks).toHaveBeenCalledTimes(1);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300');
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      keys: [
        {
          kty: 'RSA',
          alg: 'RS256',
          use: 'sig',
          kid: 'test-key-id',
          n: 'abc',
          e: 'AQAB',
        },
      ],
    });
  });
});
