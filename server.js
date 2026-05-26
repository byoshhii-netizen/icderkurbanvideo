const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3700;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'icder-kurban-video-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// API rotaları
app.use('/api/admin', require('./src/admin-routes'));
app.use('/api/medya', require('./src/cloudinary'));
app.use('/api', require('./src/routes'));

// Sayfalar
app.get('/admin-giris', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-giris.html')));
app.get('/admin', (req, res) => {
  if (!req.session.adminGiris) return res.redirect('/admin-giris');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🟢 İÇDER Kurban Videoları çalışıyor: http://localhost:${PORT}`);
  console.log(`🔐 Admin paneli: http://localhost:${PORT}/admin`);
  console.log(`📁 Data dizini: ${process.env.DATA_DIR || '/data (Railway) veya ./data (local)'}`);
});
