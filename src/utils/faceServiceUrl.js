const DEFAULT_FACE_SERVICE_URL = 'http://localhost:8000';

const FACE_SERVICE_URL = (process.env.FACE_SERVICE_URL || DEFAULT_FACE_SERVICE_URL)
  .trim()
  .replace(/\/+$/, '');

const faceServiceUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${FACE_SERVICE_URL}${normalizedPath}`;
};

module.exports = {
  FACE_SERVICE_URL,
  faceServiceUrl,
};
