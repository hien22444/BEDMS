const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a base64 image to Cloudinary.
 * @param {string} base64Data - Raw base64 string (no data URI prefix)
 * @param {object} options - Upload options (folder, public_id, etc.)
 * @returns {Promise<string>} The secure URL of the uploaded image
 */
const uploadBase64Image = async (base64Data, options = {}) => {
  const dataUri = `data:image/jpeg;base64,${base64Data}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'dms/access-snapshots',
    resource_type: 'image',
    ...options,
  });
  return result.secure_url;
};

module.exports = { cloudinary, uploadBase64Image };
