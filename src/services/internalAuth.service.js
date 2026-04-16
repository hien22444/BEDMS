const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

const DEFAULT_ISSUER = 'https://bedms-production.up.railway.app';
const DEFAULT_AUDIENCE = 'faceservice';
const DEFAULT_SUBJECT = 'bedms-face-service-client';
const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_KEY_ID = 'bedms-face-service-key-1';

const normalizeMultilineEnv = (value) => String(value || '').replace(/\\n/g, '\n').trim();

const getRequiredConfig = () => {
  const issuer = process.env.FACE_SERVICE_JWT_ISSUER || DEFAULT_ISSUER;
  const audience = process.env.FACE_SERVICE_JWT_AUDIENCE || DEFAULT_AUDIENCE;
  const keyId = process.env.FACE_SERVICE_JWT_KEY_ID || DEFAULT_KEY_ID;
  const subject = process.env.FACE_SERVICE_JWT_SUBJECT || DEFAULT_SUBJECT;
  const ttlSeconds = Number.parseInt(
    process.env.FACE_SERVICE_JWT_TTL_SECONDS || `${DEFAULT_TTL_SECONDS}`,
    10
  );
  const privateKey = normalizeMultilineEnv(process.env.FACE_SERVICE_JWT_PRIVATE_KEY);
  const publicKey = normalizeMultilineEnv(process.env.FACE_SERVICE_JWT_PUBLIC_KEY);

  if (!privateKey) {
    throw new AppError('FACE_SERVICE_JWT_PRIVATE_KEY is not configured', 500);
  }
  if (!publicKey) {
    throw new AppError('FACE_SERVICE_JWT_PUBLIC_KEY is not configured', 500);
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new AppError('FACE_SERVICE_JWT_TTL_SECONDS must be a positive integer', 500);
  }

  return {
    issuer,
    audience,
    keyId,
    subject,
    ttlSeconds,
    privateKey,
    publicKey,
  };
};

const createFaceServiceAccessToken = () => {
  const { issuer, audience, keyId, subject, ttlSeconds, privateKey } = getRequiredConfig();

  return jwt.sign(
    {},
    privateKey,
    {
      algorithm: 'RS256',
      issuer,
      audience,
      subject,
      expiresIn: ttlSeconds,
      keyid: keyId,
    }
  );
};

const getFaceServiceAuthHeaders = () => ({
  Authorization: `Bearer ${createFaceServiceAccessToken()}`,
});

const getFaceServiceJwks = () => {
  const { publicKey, keyId } = getRequiredConfig();
  const keyObject = crypto.createPublicKey(publicKey);
  const jwk = keyObject.export({ format: 'jwk' });

  return {
    keys: [
      {
        ...jwk,
        use: 'sig',
        alg: 'RS256',
        kid: keyId,
      },
    ],
  };
};

module.exports = {
  createFaceServiceAccessToken,
  getFaceServiceAuthHeaders,
  getFaceServiceJwks,
};
