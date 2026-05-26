const router = require('express').Router();
const { getDb } = require('./database');

// ─── YARDIMCI: Türkçe karakter normalize ─────────────────────────────────────
function normalizeTR(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'g').replace(/Ü/g, 'u').replace(/Ş/g, 's')
    .replace(/İ/g, 'i').replace(/Ö/g, 'o').replace(/Ç/g, 'c');
}

// Fuzzy benzerlik skoru (Levenshtein tabanlı)
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyScore(query, target) {
  if (!query || !target) return 0;
  const q = normalizeTR(query.trim());
  const t = normalizeTR(target.trim());
  if (!q || !t) return 0;

  // Tam eşleşme
  if (t === q) return 100;
  // İçeriyor
  if (t.includes(q)) return 90;
  // Kelime bazlı eşleşme
  const qWords = q.split(/\s+/);
  const tWords = t.split(/\s+/);
  let wordMatch = 0;
  qWords.forEach(qw => {
    tWords.forEach(tw => {
      if (tw.includes(qw) || qw.includes(tw)) wordMatch++;
      else {
        const dist = levenshtein(qw, tw);
        const maxLen = Math.max(qw.length, tw.length);
        if (maxLen > 0 && dist / maxLen < 0.4) wordMatch += 0.5;
      }
    });
  });
  if (wordMatch > 0) return Math.min(85, 50 + wordMatch * 15);

  // Genel Levenshtein
  const dist = levenshtein(q, t);
  const maxLen = Math.max(q.length, t.length);
  if (maxLen === 0) return 0;
  const similarity = 1 - dist / maxLen;
  return Math.round(similarity * 60);
}

// ─── AKTİF ORGANİZASYON ──────────────────────────────────────────────────────
router.get('/aktif-organizasyon', async (req, res) => {
  try {
    const db = await getDb();
    const ayar = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='aktif_organizasyon_id'").get();
    const orgId = ayar?.deger;
    if (!orgId) return res.json({ organizasyon: null });
    const org = db.prepare('SELECT * FROM organizasyonlar WHERE id=?').get(orgId);
    res.json({ organizasyon: org || null });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── ORGANİZASYONLAR LİSTESİ (public) ───────────────────────────────────────
router.get('/organizasyonlar', async (req, res) => {
  try {
    const db = await getDb();
    const orgs = db.prepare('SELECT * FROM organizasyonlar WHERE aktif=1 ORDER BY yil DESC, id DESC').all();
    res.json(orgs);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── VİDEO ARAMA (ana işlev) ─────────────────────────────────────────────────
router.get('/ara', async (req, res) => {
  const { q, org_id } = req.query;
  if (!q || q.trim().length < 1) return res.json({ sonuclar: [] });

  try {
    const db = await getDb();
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';

    // Aktif organizasyon filtresi
    let orgFilter = '';
    let orgParams = [];
    if (org_id) {
      orgFilter = ' AND v.organizasyon_id = ?';
      orgParams = [org_id];
    } else {
      // Aktif organizasyonu al
      const ayar = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='aktif_organizasyon_id'").get();
      if (ayar?.deger) {
        orgFilter = ' AND v.organizasyon_id = ?';
        orgParams = [ayar.deger];
      }
    }

    // Tüm videoları bağışçı bilgileriyle çek
    const videolar = db.prepare(`
      SELECT v.*, b.ad as bagisci_adi, b.telefon as bagisci_telefon,
             o.ad as organizasyon_adi
      FROM videolar v
      JOIN bagiscilar b ON v.bagisci_id = b.id
      JOIN organizasyonlar o ON v.organizasyon_id = o.id
      WHERE 1=1 ${orgFilter}
      ORDER BY v.olusturma DESC
    `).all(...orgParams);

    const query = q.trim();

    // Her video için skor hesapla
    const skorlu = videolar.map(v => {
      const alanlar = [
        v.bagisci_adi,
        v.baslik,
        v.arama_etiketleri,
        v.bagisci_telefon,
      ];
      const maxSkor = Math.max(...alanlar.map(a => fuzzyScore(query, a)));
      return { ...v, _skor: maxSkor };
    }).filter(v => v._skor >= 30);

    // Skora göre sırala
    skorlu.sort((a, b) => b._skor - a._skor);

    // İzleme logu kaydet (arama yapıldığında)
    try {
      db.prepare(`
        INSERT INTO izleme_loglari (video_id, bagisci_id, aranan_isim, ip_adresi, user_agent)
        VALUES (NULL, NULL, ?, ?, ?)
      `).run(query, ip, ua);
    } catch (e) {}

    res.json({ sonuclar: skorlu.slice(0, 50) });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── VİDEO İZLEME LOGU ───────────────────────────────────────────────────────
router.post('/izleme-log', async (req, res) => {
  const { video_id, bagisci_id, aranan_isim } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  try {
    const db = await getDb();
    db.prepare(`
      INSERT INTO izleme_loglari (video_id, bagisci_id, aranan_isim, ip_adresi, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `).run(video_id || null, bagisci_id || null, aranan_isim || null, ip, ua);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── SİTE AYARLARI (logo vb.) ─────────────────────────────────────────────────
router.get('/ayarlar', async (req, res) => {
  try {
    const db = await getDb();
    const rows = db.prepare("SELECT anahtar, deger FROM sistem_ayarlari WHERE anahtar IN ('site_logo_b64','site_basligi','sifre_sistemi_aktif')").all();
    const ayarlar = {};
    rows.forEach(r => { ayarlar[r.anahtar] = r.deger; });
    res.json(ayarlar);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ─── ŞİFRE KONTROLÜ (numaralı şifre sistemi) ─────────────────────────────────
router.post('/sifre-kontrol', async (req, res) => {
  try {
    const db = await getDb();
    const aktifRow = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='sifre_sistemi_aktif'").get();
    if (aktifRow?.deger !== '1') {
      return res.json({ ok: true, mesaj: 'Şifre sistemi kapalı' });
    }
    // Şifre sistemi aktifse telefon numarasıyla doğrula
    const { telefon } = req.body;
    if (!telefon) return res.status(400).json({ hata: 'Telefon numarası gerekli' });
    const temizTelefon = telefon.replace(/\D/g, '').replace(/^0/, '').replace(/^90/, '');
    const bagisci = db.prepare("SELECT id FROM bagiscilar WHERE REPLACE(REPLACE(telefon, '+90', ''), '0', '') LIKE ?").get('%' + temizTelefon + '%');
    if (!bagisci) return res.status(401).json({ hata: 'Bu numaraya ait kayıt bulunamadı' });
    req.session.dogrulanmisTelefon = temizTelefon;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

module.exports = router;
