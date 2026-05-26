const express = require('express');
const session = require('express-session');
const path = require('path');

// ─── GLOBAL HATA YAKALAMA — sunucunun çökmesini önler ────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message);
  console.error(err.stack);
  // Ölümcül değilse devam et, ölümcülse Railway zaten restart eder
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason);
});

const app = express();
const PORT = process.env.PORT || 3700;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'icder-kurban-video-2025-gizli',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    // Railway HTTPS üzerinden çalışır
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  }
}));

// ─── HEALTHCHECK — Railway bunu kullanır ─────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
});

// ─── API ROTALARI ─────────────────────────────────────────────────────────────
app.use('/api/admin', require('./src/admin-routes'));
app.use('/api/medya', require('./src/cloudinary'));
app.use('/api', require('./src/routes'));

// ─── SAYFALAR ─────────────────────────────────────────────────────────────────
app.get('/admin-giris', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin-giris.html')));

app.get('/admin', (req, res) => {
  if (!req.session.adminGiris) return res.redirect('/admin-giris');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

// SPA fallback
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── GLOBAL EXPRESS HATA HANDLER ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', req.method, req.path, err.message);
  if (res.headersSent) return;
  res.status(500).json({ hata: 'Sunucu hatası oluştu' });
});

// ─── BAŞLAT ───────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🟢 İÇDER Kurban Videoları: http://localhost:${PORT}`);
  console.log(`🔐 Admin: http://localhost:${PORT}/admin`);
  console.log(`💾 Data: ${process.env.DATA_DIR || (require('fs').existsSync('/data') ? '/data' : './data')}`);
  console.log(`🌍 Ortam: ${process.env.NODE_ENV || 'development'}\n`);

  // DB'yi önceden ısıt — ilk istek yavaş olmasın
  require('./src/database').getDb()
    .then(() => console.log('[DB] Veritabanı hazır ✓'))
    .catch(e => console.error('[DB] Başlatma hatası:', e.message));
});
