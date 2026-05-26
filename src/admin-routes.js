const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('./database');

// ─── ADMIN KONTROL ────────────────────────────────────────────────────────────
function adminKontrol(req, res, next) {
  if (!req.session.adminGiris) return res.status(401).json({ hata: 'Yetkisiz erişim' });
  next();
}

// ─── GİRİŞ ───────────────────────────────────────────────────────────────────
router.post('/giris', async (req, res) => {
  const { sifre } = req.body;
  if (!sifre) return res.status(400).json({ hata: 'Şifre gerekli' });
  try {
    const db = await getDb();
    const row = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='admin_sifre'").get();
    const dogruSifre = row?.deger || 'icder2025';
    if (sifre !== dogruSifre) return res.status(401).json({ hata: 'Şifre yanlış' });
    req.session.adminGiris = Date.now();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── ÇIKIŞ ───────────────────────────────────────────────────────────────────
router.post('/cikis', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ─── DURUM ───────────────────────────────────────────────────────────────────
router.get('/durum', (req, res) => {
  res.json({ girisYapildi: !!req.session.adminGiris });
});

// ─── ŞİFRE DEĞİŞTİR ──────────────────────────────────────────────────────────
router.post('/sifre-degistir', adminKontrol, async (req, res) => {
  const { mevcut_sifre, yeni_sifre } = req.body;
  if (!mevcut_sifre || !yeni_sifre) return res.status(400).json({ hata: 'Tüm alanlar zorunlu' });
  try {
    const db = await getDb();
    const row = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='admin_sifre'").get();
    if (mevcut_sifre !== (row?.deger || 'icder2025')) return res.status(401).json({ hata: 'Mevcut şifre yanlış' });
    db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar='admin_sifre'").run(yeni_sifre);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── LOGO YÖNETİMİ ───────────────────────────────────────────────────────────
router.get('/logo', adminKontrol, async (req, res) => {
  try {
    const db = await getDb();
    const site = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='site_logo_b64'").get();
    const admin = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='admin_logo_b64'").get();
    res.json({ site_logo: site?.deger || '', admin_logo: admin?.deger || '' });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.post('/logo', adminKontrol, async (req, res) => {
  const { tip, data } = req.body; // tip: 'site' | 'admin'
  if (!tip || !data) return res.status(400).json({ hata: 'tip ve data gerekli' });
  try {
    const db = await getDb();
    const anahtar = tip === 'site' ? 'site_logo_b64' : 'admin_logo_b64';
    db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar=?").run(data, anahtar);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── SİTE BAŞLIĞI ─────────────────────────────────────────────────────────────
router.post('/site-basligi', adminKontrol, async (req, res) => {
  const { baslik } = req.body;
  if (!baslik) return res.status(400).json({ hata: 'Başlık gerekli' });
  try {
    const db = await getDb();
    db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar='site_basligi'").run(baslik);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── ŞİFRE SİSTEMİ AKTIF/PASİF ───────────────────────────────────────────────
router.post('/sifre-sistemi', adminKontrol, async (req, res) => {
  const { aktif } = req.body;
  try {
    const db = await getDb();
    db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar='sifre_sistemi_aktif'").run(aktif ? '1' : '0');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── ORGANİZASYONLAR ─────────────────────────────────────────────────────────
router.get('/organizasyonlar', adminKontrol, async (req, res) => {
  try {
    const db = await getDb();
    const orgs = db.prepare('SELECT * FROM organizasyonlar ORDER BY yil DESC, id DESC').all();
    // Her org için bağışçı ve video sayısı
    const result = orgs.map(o => {
      const bagisciSayisi = db.prepare('SELECT COUNT(*) as c FROM bagiscilar WHERE organizasyon_id=?').get(o.id)?.c || 0;
      const videoSayisi = db.prepare('SELECT COUNT(*) as c FROM videolar WHERE organizasyon_id=?').get(o.id)?.c || 0;
      const videoVarSayisi = db.prepare('SELECT COUNT(*) as c FROM bagiscilar WHERE organizasyon_id=? AND video_var=1').get(o.id)?.c || 0;
      return { ...o, bagisci_sayisi: bagisciSayisi, video_sayisi: videoSayisi, video_var_sayisi: videoVarSayisi };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.post('/organizasyonlar', adminKontrol, async (req, res) => {
  const { ad, yil } = req.body;
  if (!ad) return res.status(400).json({ hata: 'Organizasyon adı gerekli' });
  try {
    const db = await getDb();
    const r = db.prepare('INSERT INTO organizasyonlar (ad, yil) VALUES (?, ?)').run(ad, yil || new Date().getFullYear());
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.put('/organizasyonlar/:id', adminKontrol, async (req, res) => {
  const { ad, yil, aktif } = req.body;
  try {
    const db = await getDb();
    db.prepare('UPDATE organizasyonlar SET ad=?, yil=?, aktif=? WHERE id=?').run(ad, yil, aktif ? 1 : 0, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.delete('/organizasyonlar/:id', adminKontrol, async (req, res) => {
  try {
    const db = await getDb();
    db.prepare('DELETE FROM organizasyonlar WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// Aktif organizasyon seç
router.post('/aktif-organizasyon', adminKontrol, async (req, res) => {
  const { org_id } = req.body;
  try {
    const db = await getDb();
    db.prepare("UPDATE sistem_ayarlari SET deger=? WHERE anahtar='aktif_organizasyon_id'").run(org_id ? String(org_id) : '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── BAĞIŞÇILAR ───────────────────────────────────────────────────────────────
router.get('/bagiscilar', adminKontrol, async (req, res) => {
  const { org_id, q, video_durum } = req.query;
  try {
    const db = await getDb();
    let sql = `
      SELECT b.*, o.ad as organizasyon_adi,
             (SELECT COUNT(*) FROM videolar WHERE bagisci_id=b.id) as video_sayisi
      FROM bagiscilar b
      JOIN organizasyonlar o ON b.organizasyon_id = o.id
      WHERE 1=1
    `;
    const params = [];
    if (org_id) { sql += ' AND b.organizasyon_id=?'; params.push(org_id); }
    if (q) { sql += ' AND (b.ad LIKE ? OR b.telefon LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (video_durum === 'var') { sql += ' AND b.video_var=1'; }
    if (video_durum === 'yok') { sql += ' AND b.video_var=0'; }
    sql += ' ORDER BY b.ad ASC';
    const bagiscilar = db.prepare(sql).all(...params);
    res.json(bagiscilar);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.post('/bagiscilar', adminKontrol, async (req, res) => {
  let { ad, telefon, organizasyon_id } = req.body;
  if (!ad || !organizasyon_id) return res.status(400).json({ hata: 'Ad ve organizasyon gerekli' });
  // Telefon normalize: +90 ekle, 0 başını kaldır
  if (telefon) {
    telefon = telefon.replace(/\D/g, '');
    if (telefon.startsWith('90')) telefon = telefon.slice(2);
    if (telefon.startsWith('0')) telefon = telefon.slice(1);
    telefon = '+90' + telefon;
  }
  try {
    const db = await getDb();
    const r = db.prepare('INSERT INTO bagiscilar (ad, telefon, organizasyon_id) VALUES (?, ?, ?)').run(ad, telefon || null, organizasyon_id);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.put('/bagiscilar/:id', adminKontrol, async (req, res) => {
  let { ad, telefon, organizasyon_id } = req.body;
  if (telefon) {
    telefon = telefon.replace(/\D/g, '');
    if (telefon.startsWith('90')) telefon = telefon.slice(2);
    if (telefon.startsWith('0')) telefon = telefon.slice(1);
    telefon = '+90' + telefon;
  }
  try {
    const db = await getDb();
    db.prepare('UPDATE bagiscilar SET ad=?, telefon=?, organizasyon_id=? WHERE id=?').run(ad, telefon || null, organizasyon_id, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.delete('/bagiscilar/:id', adminKontrol, async (req, res) => {
  try {
    const db = await getDb();
    // Önce videoları sil
    db.prepare('DELETE FROM videolar WHERE bagisci_id=?').run(req.params.id);
    db.prepare('DELETE FROM bagiscilar WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// Toplu bağışçı içe aktar (CSV/liste)
router.post('/bagiscilar/toplu-ekle', adminKontrol, async (req, res) => {
  const { organizasyon_id, liste } = req.body; // liste: [{ad, telefon}]
  if (!organizasyon_id || !Array.isArray(liste)) return res.status(400).json({ hata: 'Geçersiz veri' });
  try {
    const db = await getDb();
    let eklenen = 0;
    liste.forEach(item => {
      if (!item.ad) return;
      let tel = (item.telefon || '').replace(/\D/g, '');
      if (tel.startsWith('90')) tel = tel.slice(2);
      if (tel.startsWith('0')) tel = tel.slice(1);
      if (tel) tel = '+90' + tel;
      try {
        db.prepare('INSERT INTO bagiscilar (ad, telefon, organizasyon_id) VALUES (?, ?, ?)').run(item.ad, tel || null, organizasyon_id);
        eklenen++;
      } catch (e) {}
    });
    res.json({ ok: true, eklenen });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── VİDEOLAR ─────────────────────────────────────────────────────────────────
router.get('/videolar', adminKontrol, async (req, res) => {
  const { org_id, bagisci_id, q } = req.query;
  try {
    const db = await getDb();
    let sql = `
      SELECT v.*, b.ad as bagisci_adi, b.telefon as bagisci_telefon,
             o.ad as organizasyon_adi
      FROM videolar v
      JOIN bagiscilar b ON v.bagisci_id = b.id
      JOIN organizasyonlar o ON v.organizasyon_id = o.id
      WHERE 1=1
    `;
    const params = [];
    if (org_id) { sql += ' AND v.organizasyon_id=?'; params.push(org_id); }
    if (bagisci_id) { sql += ' AND v.bagisci_id=?'; params.push(bagisci_id); }
    if (q) { sql += ' AND (b.ad LIKE ? OR v.baslik LIKE ? OR v.arama_etiketleri LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY v.olusturma DESC';
    const videolar = db.prepare(sql).all(...params);
    res.json(videolar);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.post('/videolar', adminKontrol, async (req, res) => {
  const { bagisci_id, organizasyon_id, baslik, arama_etiketleri, cloudinary_url, cloudinary_public_id, thumbnail_url, sure, boyut } = req.body;
  if (!bagisci_id || !cloudinary_url || !cloudinary_public_id) {
    return res.status(400).json({ hata: 'Bağışçı ve video URL gerekli' });
  }
  try {
    const db = await getDb();
    // Bu bağışçının kaçıncı videosu?
    const sayac = db.prepare('SELECT COUNT(*) as c FROM videolar WHERE bagisci_id=?').get(bagisci_id);
    const videoNo = (sayac?.c || 0) + 1;
    const orgId = organizasyon_id || db.prepare('SELECT organizasyon_id FROM bagiscilar WHERE id=?').get(bagisci_id)?.organizasyon_id;
    const r = db.prepare(`
      INSERT INTO videolar (bagisci_id, organizasyon_id, baslik, arama_etiketleri, cloudinary_url, cloudinary_public_id, thumbnail_url, video_no, sure, boyut)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(bagisci_id, orgId, baslik || null, arama_etiketleri || null, cloudinary_url, cloudinary_public_id, thumbnail_url || null, videoNo, sure || 0, boyut || 0);
    // Bağışçının video_var durumunu güncelle
    db.prepare('UPDATE bagiscilar SET video_var=1 WHERE id=?').run(bagisci_id);
    res.json({ ok: true, id: r.lastInsertRowid, video_no: videoNo });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.put('/videolar/:id', adminKontrol, async (req, res) => {
  const { baslik, arama_etiketleri } = req.body;
  try {
    const db = await getDb();
    db.prepare('UPDATE videolar SET baslik=?, arama_etiketleri=? WHERE id=?').run(baslik || null, arama_etiketleri || null, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

router.delete('/videolar/:id', adminKontrol, async (req, res) => {
  try {
    const db = await getDb();
    const video = db.prepare('SELECT * FROM videolar WHERE id=?').get(req.params.id);
    if (!video) return res.status(404).json({ hata: 'Video bulunamadı' });
    db.prepare('DELETE FROM videolar WHERE id=?').run(req.params.id);
    // Bağışçının başka videosu var mı?
    const kalanVideo = db.prepare('SELECT COUNT(*) as c FROM videolar WHERE bagisci_id=?').get(video.bagisci_id);
    if ((kalanVideo?.c || 0) === 0) {
      db.prepare('UPDATE bagiscilar SET video_var=0 WHERE id=?').run(video.bagisci_id);
    }
    res.json({ ok: true, cloudinary_public_id: video.cloudinary_public_id });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── İZLEME LOGLARI ──────────────────────────────────────────────────────────
router.get('/izleme-loglari', adminKontrol, async (req, res) => {
  const { limit = 200, video_id, org_id } = req.query;
  try {
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
    if (video_id) { sql += ' AND l.video_id=?'; params.push(video_id); }
    if (org_id) { sql += ' AND v.organizasyon_id=?'; params.push(org_id); }
    sql += ' ORDER BY l.tarih DESC LIMIT ?';
    params.push(parseInt(limit));
    const loglar = db.prepare(sql).all(...params);
    res.json(loglar);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── DASHBOARD İSTATİSTİKLER ──────────────────────────────────────────────────
router.get('/dashboard', adminKontrol, async (req, res) => {
  try {
    const db = await getDb();
    const orgSayisi = db.prepare('SELECT COUNT(*) as c FROM organizasyonlar').get()?.c || 0;
    const bagisciSayisi = db.prepare('SELECT COUNT(*) as c FROM bagiscilar').get()?.c || 0;
    const videoSayisi = db.prepare('SELECT COUNT(*) as c FROM videolar').get()?.c || 0;
    const izlenmeSayisi = db.prepare('SELECT COUNT(*) as c FROM izleme_loglari WHERE video_id IS NOT NULL').get()?.c || 0;
    const aramaSayisi = db.prepare('SELECT COUNT(*) as c FROM izleme_loglari WHERE video_id IS NULL').get()?.c || 0;
    const sonAramalar = db.prepare('SELECT aranan_isim, ip_adresi, tarih FROM izleme_loglari ORDER BY tarih DESC LIMIT 10').all();
    res.json({ orgSayisi, bagisciSayisi, videoSayisi, izlenmeSayisi, aramaSayisi, sonAramalar });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── TÜM AYARLAR ─────────────────────────────────────────────────────────────
router.get('/ayarlar', adminKontrol, async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.prepare('SELECT anahtar, deger FROM sistem_ayarlari').all();
    const ayarlar = {};
    rows.forEach(r => { ayarlar[r.anahtar] = r.deger; });
    res.json(ayarlar);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── İÇDER KURBAN'DAN BAĞIŞÇI AKTAR ─────────────────────────────────────────
// icderrr-clone DB'sinden bağışçıları çekip bu sisteme aktarır
router.post('/icder-aktar', adminKontrol, async (req, res) => {
  const { organizasyon_id, icder_org_id } = req.body;
  if (!organizasyon_id) return res.status(400).json({ hata: 'organizasyon_id gerekli' });

  try {
    const db = await getDb();
    // İÇDER DB yolunu bul
    const icderDbPath = require('path').join(__dirname, '..', '..', 'icderrr-clone', 'data', 'icder-kurban.db');
    const fs = require('fs');
    if (!fs.existsSync(icderDbPath)) {
      return res.status(404).json({ hata: 'İÇDER veritabanı bulunamadı: ' + icderDbPath });
    }
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const icderDb = new SQL.Database(fs.readFileSync(icderDbPath));

    // Hisseleri çek (bağışçı adı ve telefon)
    let sorgu = `
      SELECT DISTINCT h.bagisci_adi, h.bagisci_telefon
      FROM hisseler h
      JOIN kurbanlar k ON h.kurban_id = k.id
      WHERE h.bagisci_adi IS NOT NULL AND h.bagisci_adi != ''
    `;
    const params = [];
    if (icder_org_id) {
      sorgu += ' AND k.organizasyon_id = ?';
      params.push(icder_org_id);
    }

    const stmt = icderDb.prepare(sorgu);
    const bagiscilar = [];
    try {
      stmt.bind(params);
      while (stmt.step()) bagiscilar.push(stmt.getAsObject());
    } finally { stmt.free(); }
    icderDb.close();

    let eklenen = 0;
    bagiscilar.forEach(b => {
      if (!b.bagisci_adi) return;
      let tel = (b.bagisci_telefon || '').replace(/\D/g, '');
      if (tel.startsWith('90')) tel = tel.slice(2);
      if (tel.startsWith('0')) tel = tel.slice(1);
      if (tel) tel = '+90' + tel;
      try {
        db.prepare('INSERT INTO bagiscilar (ad, telefon, organizasyon_id) VALUES (?, ?, ?)').run(b.bagisci_adi, tel || null, organizasyon_id);
        eklenen++;
      } catch (e) {}
    });

    res.json({ ok: true, eklenen, toplam: bagiscilar.length });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

module.exports = router;
