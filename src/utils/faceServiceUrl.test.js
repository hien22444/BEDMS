describe('faceServiceUrl', () => {
  const originalEnv = process.env;

  afterEach(() => {
    jest.resetModules();
    process.env = originalEnv;
  });

  it('removes a trailing slash from FACE_SERVICE_URL and joins paths once', () => {
    process.env = {
      ...originalEnv,
      FACE_SERVICE_URL: 'https://snide-unrevised-subscript.ngrok-free.dev/',
    };

    const { FACE_SERVICE_URL, faceServiceUrl } = require('./faceServiceUrl');

    expect(FACE_SERVICE_URL).toBe('https://snide-unrevised-subscript.ngrok-free.dev');
    expect(faceServiceUrl('/register')).toBe(
      'https://snide-unrevised-subscript.ngrok-free.dev/register'
    );
    expect(faceServiceUrl('cameras/cam-1/start')).toBe(
      'https://snide-unrevised-subscript.ngrok-free.dev/cameras/cam-1/start'
    );
  });
});
