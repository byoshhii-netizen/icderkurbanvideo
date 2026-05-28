const router = require('express').Router();
const { getDb } = require('./database');

// ─── ASYNC HATA SARMALAYICI ───────────────────────────────────────────────────
const ac = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── ADMIN KONTROL ────────────────────────────────────────────────────────────
function adminKontrol(req, res, next) {
  if (!req.session.adminGiris) return res.status(401).json({ hata: 'Yetkisiz erişim' });
  next();
}

// ─── GİRİŞ ───────────────────────────────────────────────────────────────────
router.post('/giris', ac(async (req, res) => {
  const { sifre } = req.body;
  if (!sifre) return res.status(400).json({ hata: 'Şifre gerekli' });
  const db = await getDb();
  const row = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='admin_sifre'").get();
  const dogruSifre = row?.deger || 'icder2025';
  if (sifre !== dogruSifre) return res.status(401).json({ hata: 'Şifre yanlış' });
  req.session.adminGiris = Date.now();
  res.json({ ok: true });
}));

// ─── ÇIKIŞ ───────────────────────────────────────────────────────────────────
router.post('/cikis', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ─── DURUM ───────────────────────────────────────────────────────────────────
router.get('/durum', (req, res) => {
  res.json({ girisYapildi: !!req.session.adminGiris });
});

// ─── ŞİFRE DEĞİŞTİR ──────────────────────────────────────────────────────────
router.post('/sifre-degistir', adminKontrol, ac(async (req, res) => {
  const { mevcut_sifre, yeni_sifre } = req.body;
  if (!mevcut_sifre || !yeni_sifre) return res.status(400).json({ hata: 'Tüm alanlar zorunlu' });
  const db = await getDb();
  const row = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='admin_sifre'").get();
  if (mevcut_sifre !== (row?.deger || 'icder2025')) return res.status(401).json({ hata: 'Mevcut şifre yanlış' });
  db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar='admin_sifre'").run(yeni_sifre);
  res.json({ ok: true });
}));

// ─── LOGO — public (giriş sayfasında da gösterilir) ──────────────────────────
router.get('/logo', ac(async (req, res) => {
  const db = await getDb();
  const site  = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='site_logo_b64'").get();
  const admin = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='admin_logo_b64'").get();
  res.json({ site_logo: site?.deger || '', admin_logo: admin?.deger || '' });
}));

router.post('/logo', adminKontrol, ac(async (req, res) => {
  const { tip, data } = req.body;
  if (!tip) return res.status(400).json({ hata: 'tip gerekli' });
  const db = await getDb();
  const anahtar = tip === 'site' ? 'site_logo_b64' : 'admin_logo_b64';
  db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar=?").run(data || '', anahtar);
  res.json({ ok: true });
}));

// ─── SİTE BAŞLIĞI ─────────────────────────────────────────────────────────────
router.post('/site-basligi', adminKontrol, ac(async (req, res) => {
  const { baslik } = req.body;
  if (!baslik) return res.status(400).json({ hata: 'Başlık gerekli' });
  const db = await getDb();
  db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar='site_basligi'").run(baslik);
  res.json({ ok: true });
}));

// ─── ŞİFRE SİSTEMİ ───────────────────────────────────────────────────────────
router.post('/sifre-sistemi', adminKontrol, ac(async (req, res) => {
  const { aktif } = req.body;
  const db = await getDb();
  db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar='sifre_sistemi_aktif'").run(aktif ? '1' : '0');
  res.json({ ok: true });
}));

// ─── İSİMLE ARAMA AYARI ──────────────────────────────────────────────────────
router.post('/isimle-arama', adminKontrol, ac(async (req, res) => {
  const { aktif } = req.body;
  const db = await getDb();
  db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar='isimle_arama_aktif'").run(aktif ? '1' : '0');
  res.json({ ok: true });
}));

// ─── ORGANİZASYONLAR ─────────────────────────────────────────────────────────
router.get('/organizasyonlar', adminKontrol, ac(async (req, res) => {
  const db = await getDb();
  const orgs = db.prepare('SELECT * FROM organizasyonlar ORDER BY yil DESC, id DESC').all();
  const result = orgs.map(o => ({
    ...o,
    bagisci_sayisi:   db.prepare('SELECT COUNT(*) as c FROM bagiscilar WHERE organizasyon_id=?').get(o.id)?.c || 0,
    video_sayisi:     db.prepare('SELECT COUNT(*) as c FROM videolar WHERE organizasyon_id=?').get(o.id)?.c || 0,
    video_var_sayisi: db.prepare('SELECT COUNT(*) as c FROM bagiscilar WHERE organizasyon_id=? AND video_var=1').get(o.id)?.c || 0,
  }));
  res.json(result);
}));

router.post('/organizasyonlar', adminKontrol, ac(async (req, res) => {
  const { ad, yil } = req.body;
  if (!ad) return res.status(400).json({ hata: 'Organizasyon adı gerekli' });
  const db = await getDb();
  const r = db.prepare('INSERT INTO organizasyonlar (ad, yil) VALUES (?, ?)').run(ad, yil || new Date().getFullYear());
  res.json({ ok: true, id: r.lastInsertRowid });
}));

router.put('/organizasyonlar/:id', adminKontrol, ac(async (req, res) => {
  const { ad, yil, aktif } = req.body;
  const db = await getDb();
  db.prepare('UPDATE organizasyonlar SET ad=?, yil=?, aktif=? WHERE id=?').run(ad, yil, aktif ? 1 : 0, req.params.id);
  res.json({ ok: true });
}));

router.delete('/organizasyonlar/:id', adminKontrol, ac(async (req, res) => {
  const db = await getDb();
  db.prepare('DELETE FROM organizasyonlar WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

router.post('/aktif-organizasyon', adminKontrol, ac(async (req, res) => {
  const { org_id } = req.body;
  const db = await getDb();
  db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar='aktif_organizasyon_id'").run(org_id ? String(org_id) : '');
  res.json({ ok: true });
}));

// ─── BAĞIŞÇILAR ───────────────────────────────────────────────────────────────
function normalizeTelefon(telefon) {
  if (!telefon) return null;
  let t = telefon.replace(/\D/g, '');
  if (t.startsWith('90')) t = t.slice(2);
  if (t.startsWith('0'))  t = t.slice(1);
  return t ? '+90' + t : null;
}

router.get('/bagiscilar', adminKontrol, ac(async (req, res) => {
  const { org_id, q, video_durum } = req.query;
  const db = await getDb();
  let sql = `
    SELECT b.*, o.ad as organizasyon_adi,
           (SELECT COUNT(*) FROM videolar WHERE bagisci_id=b.id) as video_sayisi
    FROM bagiscilar b
    JOIN organizasyonlar o ON b.organizasyon_id = o.id
    WHERE 1=1
  `;
  const params = [];
  if (org_id)                  { sql += ' AND b.organizasyon_id=?'; params.push(org_id); }
  if (q)                       { sql += ' AND (b.ad LIKE ? OR b.telefon LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (video_durum === 'var')   { sql += ' AND b.video_var=1'; }
  if (video_durum === 'yok')   { sql += ' AND b.video_var=0'; }
  sql += ' ORDER BY b.ad ASC';
  res.json(db.prepare(sql).all(...params));
}));

router.post('/bagiscilar', adminKontrol, ac(async (req, res) => {
  const { ad, telefon, organizasyon_id, hisse_no,
          etiket1, etiket2, etiket3, etiket4, etiket5, etiket6, etiket7,
          grup_id } = req.body;
  if (!ad || !organizasyon_id) return res.status(400).json({ hata: 'Ad ve organizasyon gerekli' });
  const db = await getDb();
  const r = db.prepare(`INSERT INTO bagiscilar
    (ad, telefon, organizasyon_id, hisse_no, etiket1, etiket2, etiket3, etiket4, etiket5, etiket6, etiket7, grup_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ad, normalizeTelefon(telefon), organizasyon_id,
         hisse_no || 1,
         etiket1 || null, etiket2 || null, etiket3 || null, etiket4 || null,
         etiket5 || null, etiket6 || null, etiket7 || null,
         grup_id || null);
  res.json({ ok: true, id: r.lastInsertRowid });
}));

router.put('/bagiscilar/:id', adminKontrol, ac(async (req, res) => {
  const { ad, telefon, organizasyon_id, hisse_no,
          etiket1, etiket2, etiket3, etiket4, etiket5, etiket6, etiket7,
          grup_id } = req.body;
  const db = await getDb();
  db.prepare(`UPDATE bagiscilar SET
    ad=?, telefon=?, organizasyon_id=?, hisse_no=?,
    etiket1=?, etiket2=?, etiket3=?, etiket4=?, etiket5=?, etiket6=?, etiket7=?,
    grup_id=?
    WHERE id=?`)
    .run(ad, normalizeTelefon(telefon), organizasyon_id,
         hisse_no || 1,
         etiket1 || null, etiket2 || null, etiket3 || null, etiket4 || null,
         etiket5 || null, etiket6 || null, etiket7 || null,
         grup_id || null,
         req.params.id);
  res.json({ ok: true });
}));

router.delete('/bagiscilar/:id', adminKontrol, ac(async (req, res) => {
  const db = await getDb();
  db.prepare('DELETE FROM videolar WHERE bagisci_id=?').run(req.params.id);
  db.prepare('DELETE FROM bagiscilar WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

router.post('/bagiscilar/toplu-ekle', adminKontrol, ac(async (req, res) => {
  const { organizasyon_id, liste } = req.body;
  if (!organizasyon_id || !Array.isArray(liste)) return res.status(400).json({ hata: 'Geçersiz veri' });
  const db = await getDb();
  let eklenen = 0;
  liste.forEach(item => {
    if (!item.ad) return;
    try {
      db.prepare('INSERT INTO bagiscilar (ad, telefon, organizasyon_id) VALUES (?, ?, ?)')
        .run(item.ad, normalizeTelefon(item.telefon), organizasyon_id);
      eklenen++;
    } catch (_) {}
  });
  res.json({ ok: true, eklenen });
}));

// ─── VİDEOLAR ─────────────────────────────────────────────────────────────────
router.get('/videolar', adminKontrol, ac(async (req, res) => {
  const { org_id, bagisci_id, q } = req.query;
  const db = await getDb();
  let sql = `
    SELECT v.*, b.ad as bagisci_adi, b.telefon as bagisci_telefon, b.hisse_no, b.grup_id,
           o.ad as organizasyon_adi
    FROM videolar v
    JOIN bagiscilar b ON v.bagisci_id = b.id
    JOIN organizasyonlar o ON v.organizasyon_id = o.id
    WHERE 1=1
  `;
  const params = [];
  if (org_id)     { sql += ' AND v.organizasyon_id=?'; params.push(org_id); }
  if (bagisci_id) { sql += ' AND v.bagisci_id=?'; params.push(bagisci_id); }
  if (q)          { sql += ' AND (b.ad LIKE ? OR v.baslik LIKE ? OR v.arama_etiketleri LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY v.olusturma DESC';
  const videolar = db.prepare(sql).all(...params);

  // Her video için grup üyelerini ekle
  const result = videolar.map(v => {
    if (v.grup_id) {
      const grupUyeleri = db.prepare(
        'SELECT id, ad, hisse_no FROM bagiscilar WHERE grup_id=? AND organizasyon_id=? ORDER BY hisse_no ASC'
      ).all(v.grup_id, v.organizasyon_id);
      return { ...v, grup_uyeleri: grupUyeleri };
    }
    return { ...v, grup_uyeleri: [] };
  });

  res.json(result);
}));

router.post('/videolar', adminKontrol, ac(async (req, res) => {
  const { bagisci_id, organizasyon_id, baslik, arama_etiketleri,
          cloudinary_url, cloudinary_public_id, thumbnail_url, sure, boyut } = req.body;
  if (!bagisci_id || !cloudinary_url || !cloudinary_public_id)
    return res.status(400).json({ hata: 'Bağışçı ve video URL gerekli' });
  const db = await getDb();

  // Seçilen bağışçıyı al
  const bagisci = db.prepare('SELECT * FROM bagiscilar WHERE id=?').get(bagisci_id);
  if (!bagisci) return res.status(404).json({ hata: 'Bağışçı bulunamadı' });

  const orgId = organizasyon_id || bagisci.organizasyon_id;

  // Gruba dahil tüm bağışçıları bul (grup_id varsa), yoksa sadece seçilen bağışçı
  let hedefBagiscilar = [bagisci];
  if (bagisci.grup_id) {
    hedefBagiscilar = db.prepare(
      'SELECT * FROM bagiscilar WHERE grup_id=? AND organizasyon_id=?'
    ).all(bagisci.grup_id, orgId);
    if (hedefBagiscilar.length === 0) hedefBagiscilar = [bagisci];
  }

  // Her bağışçıya video kaydı oluştur
  const eklenenIdler = [];
  for (const b of hedefBagiscilar) {
    const sayac = db.prepare('SELECT COUNT(*) as c FROM videolar WHERE bagisci_id=?').get(b.id);
    const videoNo = (sayac?.c || 0) + 1;
    const r = db.prepare(`
      INSERT INTO videolar (bagisci_id, organizasyon_id, baslik, arama_etiketleri,
        cloudinary_url, cloudinary_public_id, thumbnail_url, video_no, sure, boyut)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(b.id, orgId, baslik || null, arama_etiketleri || null,
           cloudinary_url, cloudinary_public_id, thumbnail_url || null,
           videoNo, sure || 0, boyut || 0);
    db.prepare('UPDATE bagiscilar SET video_var=1 WHERE id=?').run(b.id);
    eklenenIdler.push(r.lastInsertRowid);
  }

  res.json({
    ok: true,
    id: eklenenIdler[0],
    video_no: 1,
    grup_sayisi: hedefBagiscilar.length,
    mesaj: hedefBagiscilar.length > 1
      ? `${hedefBagiscilar.length} bağışçıya (grup) video eklendi`
      : 'Video eklendi'
  });
}));

router.put('/videolar/:id', adminKontrol, ac(async (req, res) => {
  const { baslik, arama_etiketleri } = req.body;
  const db = await getDb();
  db.prepare('UPDATE videolar SET baslik=?, arama_etiketleri=? WHERE id=?')
    .run(baslik || null, arama_etiketleri || null, req.params.id);
  res.json({ ok: true });
}));

// ─── VİDEO DOSYASINI DEĞİŞTİR ────────────────────────────────────────────────
router.post('/videolar/:id/video-degistir', adminKontrol, ac(async (req, res) => {
  const cloudinary = require('cloudinary').v2;
  const multer = require('multer');
  const { configureCloudinary } = require('./cloudinary');

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('video/')) cb(null, true);
      else cb(new Error('Sadece video dosyası yükleyebilirsiniz'));
    }
  }).single('video');

  // Multer'ı promise olarak çalıştır
  await new Promise((resolve, reject) => upload(req, res, err => err ? reject(err) : resolve()));

  if (!req.file) return res.status(400).json({ hata: 'Video dosyası bulunamadı' });

  const db = await getDb();
  const video = db.prepare('SELECT * FROM videolar WHERE id=?').get(req.params.id);
  if (!video) return res.status(404).json({ hata: 'Video bulunamadı' });

  configureCloudinary();

  // Yeni videoyu Cloudinary'ye yükle
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'icder-kurban-videolari',
        resource_type: 'video',
        eager: [{ format: 'jpg', transformation: [{ width: 400, height: 300, crop: 'fill' }] }],
        eager_async: false,
      },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(req.file.buffer);
  });

  const thumbnailUrl = result.eager && result.eager[0]
    ? result.eager[0].secure_url
    : result.secure_url.replace('/upload/', '/upload/w_400,h_300,c_fill,f_jpg/').replace(/\.[^.]+$/, '.jpg');

  // Eski videoyu Cloudinary'den sil
  if (video.cloudinary_public_id) {
    try {
      await cloudinary.uploader.destroy(video.cloudinary_public_id, { resource_type: 'video' });
    } catch(e) { console.warn('[Cloudinary] Eski video silinemedi:', e.message); }
  }

  // DB'yi güncelle
  db.prepare('UPDATE videolar SET cloudinary_url=?, cloudinary_public_id=?, thumbnail_url=?, boyut=?, sure=? WHERE id=?')
    .run(result.secure_url, result.public_id, thumbnailUrl, result.bytes || 0, result.duration || 0, req.params.id);

  res.json({ ok: true, url: result.secure_url, thumbnail_url: thumbnailUrl });
}));

router.delete('/videolar/:id', adminKontrol, ac(async (req, res) => {
  const db = await getDb();
  const video = db.prepare('SELECT * FROM videolar WHERE id=?').get(req.params.id);
  if (!video) return res.status(404).json({ hata: 'Video bulunamadı' });
  db.prepare('DELETE FROM videolar WHERE id=?').run(req.params.id);
  const kalan = db.prepare('SELECT COUNT(*) as c FROM videolar WHERE bagisci_id=?').get(video.bagisci_id);
  if ((kalan?.c || 0) === 0) db.prepare('UPDATE bagiscilar SET video_var=0 WHERE id=?').run(video.bagisci_id);
  res.json({ ok: true, cloudinary_public_id: video.cloudinary_public_id });
}));

// ─── İZLEME LOGLARI ──────────────────────────────────────────────────────────
router.get('/izleme-loglari', adminKontrol, ac(async (req, res) => {
  const { limit = 300, video_id, org_id, sadece_izleme, sadece_arama } = req.query;
  const db = await getDb();
  let sql = `
    SELECT l.*, v.baslik as video_baslik, b.ad as bagisci_adi, o.ad as organizasyon_adi
    FROM izleme_loglari l
    LEFT JOIN videolar v ON l.video_id = v.id
    LEFT JOIN bagiscilar b ON l.bagisci_id = b.id
    LEFT JOIN organizasyonlar o ON v.organizasyon_id = o.id
    WHERE 1=1
  `;
  const params = [];
  if (video_id)       { sql += ' AND l.video_id=?'; params.push(video_id); }
  if (org_id)         { sql += ' AND v.organizasyon_id=?'; params.push(org_id); }
  if (sadece_izleme)  { sql += ' AND l.video_id IS NOT NULL'; }
  if (sadece_arama)   { sql += ' AND l.video_id IS NULL'; }
  sql += ' ORDER BY l.tarih DESC LIMIT ?';
  params.push(parseInt(limit) || 300);
  res.json(db.prepare(sql).all(...params));
}));

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', adminKontrol, ac(async (req, res) => {
  const db = await getDb();
  res.json({
    orgSayisi:      db.prepare('SELECT COUNT(*) as c FROM organizasyonlar').get()?.c || 0,
    bagisciSayisi:  db.prepare('SELECT COUNT(*) as c FROM bagiscilar').get()?.c || 0,
    videoSayisi:    db.prepare('SELECT COUNT(*) as c FROM videolar').get()?.c || 0,
    izlenmeSayisi:  db.prepare('SELECT COUNT(*) as c FROM izleme_loglari WHERE video_id IS NOT NULL').get()?.c || 0,
    aramaSayisi:    db.prepare('SELECT COUNT(*) as c FROM izleme_loglari WHERE video_id IS NULL').get()?.c || 0,
    sonAramalar:    db.prepare('SELECT aranan_isim, ip_adresi, tarih FROM izleme_loglari ORDER BY tarih DESC LIMIT 10').all(),
  });
}));

// ─── TÜM AYARLAR ─────────────────────────────────────────────────────────────
router.get('/ayarlar', adminKontrol, ac(async (req, res) => {
  const db = await getDb();
  const rows = db.prepare('SELECT anahtar, deger FROM sistem_ayarlari').all();
  const ayarlar = {};
  rows.forEach(r => { ayarlar[r.anahtar] = r.deger; });
  res.json(ayarlar);
}));

// ─── DB YEDEK İNDİR ──────────────────────────────────────────────────────────
router.get('/yedek-indir', adminKontrol, ac(async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  // DB'yi önce kaydet
  const { getDb: _getDb } = require('./database');
  await _getDb(); // ensure saved
  const dataDir = process.env.DATA_DIR ||
    (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'));
  const dbPath = path.join(dataDir, 'kurban-video.db');
  if (!fs.existsSync(dbPath)) return res.status(404).json({ hata: 'DB bulunamadı' });
  const tarih = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Disposition', `attachment; filename="kurban-video-yedek-${tarih}.db"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.sendFile(dbPath);
}));

// ─── İÇDER KURBAN ENTEGRASYONU ───────────────────────────────────────────────
// İÇDER DB'sini oku — lokal dosya veya API üzerinden
async function icderDbOku() {
  const fs = require('fs');
  const path = require('path');

  // 1. Lokal DB dosyası dene (aynı sunucuda çalışıyorsa)
  const olasiYollar = [
    path.join(__dirname, '..', '..', 'icderrr-clone', 'data', 'icder-kurban.db'),
    path.join(__dirname, '..', '..', 'icderrr-clone', 'data', 'kurban.db'),
    '/data/icder-kurban.db', // Railway volume
  ];

  for (const dbYolu of olasiYollar) {
    if (fs.existsSync(dbYolu)) {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();
      const db = new SQL.Database(fs.readFileSync(dbYolu));
      return { tip: 'dosya', db, yol: dbYolu };
    }
  }

  return null; // Bulunamadı
}

// İÇDER organizasyonlarını listele
router.get('/icder-organizasyonlar', adminKontrol, ac(async (req, res) => {
  const sonuc = await icderDbOku();
  if (!sonuc) {
    return res.json({ organizasyonlar: [], mesaj: 'İÇDER veritabanı bulunamadı. Lokal kurulumda çalışır.' });
  }

  const { db } = sonuc;
  const stmt = db.prepare('SELECT id, ad, yil, aktif FROM organizasyonlar ORDER BY yil DESC, id DESC');
  const orgs = [];
  try {
    stmt.bind([]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      // Her org için bağışçı sayısını da al
      const sayacStmt = db.prepare(`
        SELECT COUNT(DISTINCT h.bagisci_adi) as c
        FROM hisseler h
        JOIN kurbanlar k ON h.kurban_id = k.id
        WHERE k.organizasyon_id = ? AND h.bagisci_adi IS NOT NULL AND h.bagisci_adi != ''
      `);
      sayacStmt.bind([row.id]);
      let bagisciSayisi = 0;
      if (sayacStmt.step()) bagisciSayisi = sayacStmt.getAsObject().c || 0;
      sayacStmt.free();
      orgs.push({ ...row, bagisci_sayisi: bagisciSayisi });
    }
  } finally { stmt.free(); }
  db.close();

  res.json({ organizasyonlar: orgs });
}));

// İÇDER'den bağışçı aktar — gelişmiş versiyon
router.post('/icder-aktar', adminKontrol, ac(async (req, res) => {
  const { organizasyon_id, icder_org_id, uzerine_yaz } = req.body;
  if (!organizasyon_id) return res.status(400).json({ hata: 'organizasyon_id gerekli' });

  const sonuc = await icderDbOku();
  if (!sonuc) {
    return res.status(404).json({
      hata: 'İÇDER veritabanı bulunamadı. Bu özellik sadece lokal kurulumda çalışır.'
    });
  }

  const { db: icderDb } = sonuc;

  // Bağışçıları çek
  let sorgu = `
    SELECT DISTINCT
      h.bagisci_adi as ad,
      h.bagisci_telefon as telefon
    FROM hisseler h
    JOIN kurbanlar k ON h.kurban_id = k.id
    WHERE h.bagisci_adi IS NOT NULL AND h.bagisci_adi != ''
  `;
  const params = [];
  if (icder_org_id) {
    sorgu += ' AND k.organizasyon_id = ?';
    params.push(icder_org_id);
  }
  sorgu += ' ORDER BY h.bagisci_adi ASC';

  const stmt = icderDb.prepare(sorgu);
  const bagiscilar = [];
  try {
    stmt.bind(params);
    while (stmt.step()) bagiscilar.push(stmt.getAsObject());
  } finally { stmt.free(); }
  icderDb.close();

  const db = await getDb();
  let eklenen = 0;
  let atlanan = 0;
  let guncellenen = 0;

  bagiscilar.forEach(b => {
    if (!b.ad) return;
    const tel = normalizeTelefon(b.telefon);

    // Zaten var mı? (aynı isim + aynı org)
    const mevcut = db.prepare(
      'SELECT id FROM bagiscilar WHERE ad=? AND organizasyon_id=?'
    ).get(b.ad, organizasyon_id);

    if (mevcut) {
      if (uzerine_yaz && tel) {
        db.prepare('UPDATE bagiscilar SET telefon=? WHERE id=?').run(tel, mevcut.id);
        guncellenen++;
      } else {
        atlanan++;
      }
    } else {
      try {
        db.prepare('INSERT INTO bagiscilar (ad, telefon, organizasyon_id) VALUES (?, ?, ?)')
          .run(b.ad, tel, organizasyon_id);
        eklenen++;
      } catch (_) { atlanan++; }
    }
  });

  res.json({
    ok: true,
    eklenen,
    atlanan,
    guncellenen,
    toplam: bagiscilar.length,
    mesaj: `${eklenen} yeni eklendi, ${atlanan} atlandı${guncellenen ? `, ${guncellenen} güncellendi` : ''}`
  });
}));

module.exports = router;
