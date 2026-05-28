const router = require('express').Router();
const { getDb } = require('./database');

// ─── ASYNC HATA SARMALAYICI ───────────────────────────────────────────────────
const ac = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

// ─── TEK VİDEO (direkt link için) ────────────────────────────────────────────
router.get('/video/:id', ac(async (req, res) => {
  const db = await getDb();
  const v = db.prepare(`
    SELECT v.*, b.ad as bagisci_adi, b.telefon as bagisci_telefon,
           o.ad as organizasyon_adi
    FROM videolar v
    JOIN bagiscilar b ON v.bagisci_id = b.id
    JOIN organizasyonlar o ON v.organizasyon_id = o.id
    WHERE v.id = ?
  `).get(req.params.id);
  if (!v) return res.status(404).json({ hata: 'Video bulunamadı' });
  res.json(v);
}));

// ─── AKTİF ORGANİZASYON ──────────────────────────────────────────────────────
router.get('/aktif-organizasyon', ac(async (req, res) => {
  const db = await getDb();
  const ayar = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='aktif_organizasyon_id'").get();
  const orgId = ayar?.deger;
  if (!orgId) return res.json({ organizasyon: null });
  const org = db.prepare('SELECT * FROM organizasyonlar WHERE id=?').get(orgId);
  res.json({ organizasyon: org || null });
}));

// ─── ORGANİZASYONLAR LİSTESİ (public) ───────────────────────────────────────
router.get('/organizasyonlar', ac(async (req, res) => {
  const db = await getDb();
  const orgs = db.prepare('SELECT * FROM organizasyonlar WHERE aktif=1 ORDER BY yil DESC, id DESC').all();
  res.json(orgs);
}));

// ─── VİDEO ARAMA (ana işlev) ─────────────────────────────────────────────────
router.get('/ara', ac(async (req, res) => {
  const { q, org_id } = req.query;
  if (!q || q.trim().length < 1) return res.json({ sonuclar: [] });

  const db = await getDb();
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';

  // İsimle arama ayarını oku
  const isimAramaRow = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='isimle_arama_aktif'").get();
  const isimleAramaAktif = isimAramaRow?.deger === '1';

  let orgFilter = '';
  let orgParams = [];
  if (org_id) {
    orgFilter = ' AND v.organizasyon_id = ?';
    orgParams = [org_id];
  } else {
    const ayar = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='aktif_organizasyon_id'").get();
    if (ayar?.deger) {
      orgFilter = ' AND v.organizasyon_id = ?';
      orgParams = [ayar.deger];
    }
  }

  const videolar = db.prepare(`
    SELECT v.*, b.ad as bagisci_adi, b.telefon as bagisci_telefon,
           b.hisse_no, b.etiket1, b.etiket2, b.etiket3, b.etiket4, b.etiket5, b.etiket6, b.etiket7,
           o.ad as organizasyon_adi
    FROM videolar v
    JOIN bagiscilar b ON v.bagisci_id = b.id
    JOIN organizasyonlar o ON v.organizasyon_id = o.id
    WHERE 1=1 ${orgFilter}
    ORDER BY v.olusturma DESC
  `).all(...orgParams);

  const query = q.trim();

  // Telefon normalize (arama sorgusunu da normalize et)
  function normalizeTelefon(t) {
    if (!t) return '';
    let s = String(t).replace(/\D/g, '');
    if (s.startsWith('90') && s.length > 10) s = s.slice(2);
    if (s.startsWith('0')) s = s.slice(1);
    return s;
  }
  const queryTelefon = normalizeTelefon(query);
  const queryRakamMi = /^\d{4,}$/.test(queryTelefon); // en az 4 rakam ise telefon/etiket araması

  // İsim araması kapalıyken: sadece rakam/etiket araması — isim araması tamamen engellenir
  // Rakam değilse ve isim araması da kapalıysa hiç sonuç dönme
  if (!isimleAramaAktif && !queryRakamMi) {
    // Etiket araması için metin de olabilir (sıra no, TC gibi), ama fuzzy isim araması yapılmaz
    // Sadece tam/kısmi etiket eşleşmesi kontrol edilir
    const etiketSonuclar = videolar.map(v => {
      const bagisciEtiketler = [v.etiket1, v.etiket2, v.etiket3, v.etiket4, v.etiket5, v.etiket6, v.etiket7]
        .filter(Boolean);
      let etiketSkoru = 0;
      if (bagisciEtiketler.length) {
        etiketSkoru = Math.max(...bagisciEtiketler.map(e => {
          if (String(e).trim().toLowerCase() === query.trim().toLowerCase()) return 100;
          if (String(e).toLowerCase().includes(query.toLowerCase())) return 90;
          return 0; // isim araması kapalıyken fuzzy etiket eşleşmesi yok
        }));
      }
      const videoEtiketler = (v.arama_etiketleri || '').split(',').map(e => e.trim()).filter(Boolean);
      const videoEtiketSkoru = videoEtiketler.length
        ? Math.max(...videoEtiketler.map(e => {
            if (e.toLowerCase() === query.toLowerCase()) return 100;
            if (e.toLowerCase().includes(query.toLowerCase())) return 90;
            return 0;
          }))
        : 0;
      const maxSkor = Math.max(
        etiketSkoru > 0 ? etiketSkoru + 5 : 0,
        videoEtiketSkoru > 0 ? videoEtiketSkoru + 3 : 0
      );
      return { ...v, _skor: maxSkor };
    }).filter(v => v._skor >= 90); // sadece tam/kısmi eşleşme — fuzzy yok
    etiketSonuclar.sort((a, b) => b._skor - a._skor);

    try {
      db.prepare('INSERT INTO izleme_loglari (video_id, bagisci_id, aranan_isim, ip_adresi, user_agent) VALUES (NULL, NULL, ?, ?, ?)')
        .run(query, ip, ua);
    } catch (_) {}

    return res.json({ sonuclar: etiketSonuclar.slice(0, 50) });
  }

  const skorlu = videolar.map(v => {
    // 1. Telefon eşleşmesi (tam veya kısmi)
    let telefonSkoru = 0;
    if (queryRakamMi) {
      const dbTel = normalizeTelefon(v.bagisci_telefon);
      if (dbTel && dbTel === queryTelefon) telefonSkoru = 100;
      else if (dbTel && (dbTel.includes(queryTelefon) || queryTelefon.includes(dbTel))) telefonSkoru = 85;
    }

    // 2. Bağışçı etiketleri (etiket1-7) — rakam veya metin olabilir
    const bagisciEtiketler = [v.etiket1, v.etiket2, v.etiket3, v.etiket4, v.etiket5, v.etiket6, v.etiket7]
      .filter(Boolean);
    let bagisciEtiketSkoru = 0;
    if (bagisciEtiketler.length) {
      bagisciEtiketSkoru = Math.max(...bagisciEtiketler.map(e => {
        // Tam eşleşme
        if (String(e).trim() === query.trim()) return 100;
        // İçeriyor
        if (String(e).toLowerCase().includes(query.toLowerCase())) return 90;
        // Rakam ise normalize karşılaştır
        if (queryRakamMi) {
          const eNorm = normalizeTelefon(String(e));
          if (eNorm && eNorm === queryTelefon) return 100;
          if (eNorm && eNorm.includes(queryTelefon)) return 85;
        }
        return fuzzyScore(query, String(e));
      }));
    }

    // 3. Video arama etiketleri (virgülle ayrılmış)
    const videoEtiketler = (v.arama_etiketleri || '').split(',').map(e => e.trim()).filter(Boolean);
    const videoEtiketSkoru = videoEtiketler.length
      ? Math.max(...videoEtiketler.map(e => fuzzyScore(query, e)))
      : 0;

    // 4. İsim araması — sadece ayar açıksa
    let isimSkoru = 0;
    if (isimleAramaAktif) {
      isimSkoru = Math.max(
        fuzzyScore(query, v.bagisci_adi),
        fuzzyScore(query, v.baslik)
      );
    }

    // En yüksek skoru al — etiket/telefon eşleşmesi öncelikli
    const maxSkor = Math.max(
      telefonSkoru,
      bagisciEtiketSkoru > 0 ? bagisciEtiketSkoru + 5 : 0,
      videoEtiketSkoru > 0 ? videoEtiketSkoru + 3 : 0,
      isimSkoru
    );
    return { ...v, _skor: maxSkor };
  }).filter(v => v._skor >= 30);
  skorlu.sort((a, b) => b._skor - a._skor);

  // Arama logu — hata olsa bile sonuç dön
  try {
    db.prepare('INSERT INTO izleme_loglari (video_id, bagisci_id, aranan_isim, ip_adresi, user_agent) VALUES (NULL, NULL, ?, ?, ?)')
      .run(query, ip, ua);
  } catch (_) {}

  res.json({ sonuclar: skorlu.slice(0, 50) });
}));

// ─── VİDEO İZLEME LOGU ───────────────────────────────────────────────────────
router.post('/izleme-log', ac(async (req, res) => {
  const { video_id, bagisci_id, aranan_isim } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  const db = await getDb();
  try {
    db.prepare('INSERT INTO izleme_loglari (video_id, bagisci_id, aranan_isim, ip_adresi, user_agent) VALUES (?, ?, ?, ?, ?)')
      .run(video_id || null, bagisci_id || null, aranan_isim || null, ip, ua);
  } catch (_) {}
  res.json({ ok: true });
}));

// ─── SİTE AYARLARI ────────────────────────────────────────────────────────────
router.get('/ayarlar', ac(async (req, res) => {
  const db = await getDb();
  const rows = db.prepare("SELECT anahtar, deger FROM sistem_ayarlari WHERE anahtar IN ('site_logo_b64','site_basligi','sifre_sistemi_aktif','isimle_arama_aktif')").all();
  const ayarlar = {};
  rows.forEach(r => { ayarlar[r.anahtar] = r.deger; });
  res.json(ayarlar);
}));

// ─── ŞİFRE KONTROLÜ ──────────────────────────────────────────────────────────
router.post('/sifre-kontrol', ac(async (req, res) => {
  const db = await getDb();
  const aktifRow = db.prepare("SELECT deger FROM sistem_ayarlari WHERE anahtar='sifre_sistemi_aktif'").get();
  if (aktifRow?.deger !== '1') return res.json({ ok: true, mesaj: 'Şifre sistemi kapalı' });
  const { telefon } = req.body;
  if (!telefon) return res.status(400).json({ hata: 'Telefon numarası gerekli' });

  // Girilen numarayı normalize et: sadece rakamlar, başındaki 0 veya 90 kaldır → 10 haneli numara
  let temizTelefon = telefon.replace(/\D/g, '');
  if (temizTelefon.startsWith('90') && temizTelefon.length > 10) temizTelefon = temizTelefon.slice(2);
  if (temizTelefon.startsWith('0')) temizTelefon = temizTelefon.slice(1);

  if (temizTelefon.length < 7) return res.status(400).json({ hata: 'Geçersiz telefon numarası' });

  // DB'deki tüm bağışçıları çek, normalize ederek karşılaştır
  const bagiscilar = db.prepare('SELECT id, telefon FROM bagiscilar WHERE telefon IS NOT NULL').all();
  const eslesen = bagiscilar.find(b => {
    let t = (b.telefon || '').replace(/\D/g, '');
    if (t.startsWith('90') && t.length > 10) t = t.slice(2);
    if (t.startsWith('0')) t = t.slice(1);
    return t === temizTelefon;
  });

  if (!eslesen) return res.status(401).json({ hata: 'Bu numaraya ait kayıt bulunamadı' });
  req.session.dogrulanmisTelefon = temizTelefon;
  res.json({ ok: true });
}));

module.exports = router;
