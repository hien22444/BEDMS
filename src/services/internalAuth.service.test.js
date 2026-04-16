const crypto = require('crypto');
const jwt = require('jsonwebtoken');

describe('internalAuthService', () => {
  const originalEnv = process.env;
  let privateKeyPem;
  let publicKeyPem;

  beforeAll(() => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' });
    publicKeyPem = publicKey.export({ type: 'pkcs1', format: 'pem' });
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      FACE_SERVICE_JWT_ISSUER: 'https://bedms-production.up.railway.app',
      FACE_SERVICE_JWT_AUDIENCE: 'faceservice',
      FACE_SERVICE_JWT_KEY_ID: 'test-key-id',
      FACE_SERVICE_JWT_TTL_SECONDS: '300',
      FACE_SERVICE_JWT_PRIVATE_KEY: privateKeyPem,
      FACE_SERVICE_JWT_PUBLIC_KEY: publicKeyPem,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates an RS256 token with the expected claims and kid', () => {
    const internalAuthService = require('./internalAuth.service');

    const token = internalAuthService.createFaceServiceAccessToken();
    const decoded = jwt.verify(token, publicKeyPem, {
      algorithms: ['RS256'],
      issuer: process.env.FACE_SERVICE_JWT_ISSUER,
      audience: process.env.FACE_SERVICE_JWT_AUDIENCE,
    });
    const header = jwt.decode(token, { complete: true }).header;

    expect(decoded.sub).toBe('bedms-face-service-client');
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe('test-key-id');
  });

  it('exports a JWKS document with the configured kid', () => {
    const internalAuthService = require('./internalAuth.service');

    const jwks = internalAuthService.getFaceServiceJwks();

    expect(jwks).toEqual({
      keys: [
        expect.objectContaining({
          kty: 'RSA',
          alg: 'RS256',
          use: 'sig',
          kid: 'test-key-id',
          n: expect.any(String),
          e: expect.any(String),
        }),
      ],
    });
  });
});
