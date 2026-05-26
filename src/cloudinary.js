const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const router = require('express').Router();
const { getDb } = require('./database');

// Cloudinary config — admin panelinden güncellenebilir
function getCloudinaryConfig() {
  return {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dguch8d6w',
    api_key: process.env.CLOUDINARY_API_KEY || '253232419598976',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'agZ6arR8iRBS9vFP8tBfKWiTE6Q',
  };
}

function configureCloudinary() {
  cloudinary.config(getCloudinaryConfig());
}
configureCloudinary();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB video için
  fileFilter: (req, file, cb) => {
    const allowed = [
      'video/mp4', 'video/quicktime', 'video/webm', 'video/avi',
      'video/x-msvideo', 'video/x-matroska', 'video/3gpp',
      'image/jpeg', 'image/png', 'image/webp',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Desteklenmeyen dosya türü: ' + file.mimetype));
    }
  }
});

// Admin kontrolü middleware
function adminKontrol(req, res, next) {
  if (!req.session.adminGiris) return res.status(401).json({ hata: 'Yetkisiz' });
  next();
}

// Video yükle
router.post('/upload', adminKontrol, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ hata: 'Video dosyası bulunamadı' });
  try {
    configureCloudinary();
    const isVideo = req.file.mimetype.startsWith('video/');
    const folder = 'icder-kurban-videolari';

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: isVideo ? 'video' : 'image',
          // Video için thumbnail otomatik oluşturulsun
          eager: isVideo ? [{ format: 'jpg', transformation: [{ width: 400, height: 300, crop: 'fill' }] }] : [],
          eager_async: false,
        },
        (err, result) => err ? reject(err) : resolve(result)
      );
      stream.end(req.file.buffer);
    });

    const thumbnailUrl = result.eager && result.eager[0]
      ? result.eager[0].secure_url
      : result.secure_url.replace('/upload/', '/upload/w_400,h_300,c_fill,f_jpg/').replace(/\.[^.]+$/, '.jpg');

    res.json({
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format,
      bytes: result.bytes,
      duration: result.duration || null,
      thumbnail_url: thumbnailUrl,
    });
  } catch (e) {
    console.error('[Cloudinary Upload]', e.message);
    res.status(500).json({ hata: 'Video yüklenemedi: ' + e.message });
  }
});

// Video sil
router.delete('/delete', adminKontrol, async (req, res) => {
  const { public_id } = req.body;
  if (!public_id) return res.status(400).json({ hata: 'public_id gerekli' });
  try {
    configureCloudinary();
    const result = await cloudinary.uploader.destroy(public_id, { resource_type: 'video' });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

module.exports = router;
module.exports.configureCloudinary = configureCloudinary;
