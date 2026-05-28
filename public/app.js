'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────────
let aramaTimeout = null;
let aktifVideo = null;
let tumVideolar = []; // /video/:id için cache
let sifreSistemiAktif = false;
let dogrulanmisTelefon = null; // oturum boyunca bir kez doğrulama yeterli
let bekleyenVideo = null;      // şifre onayı beklenen video

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await ayarlariYukle();
  await organizasyonlariYukle();
  urlRouteIsle(); // URL'e göre sayfa durumunu ayarla

  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    clearTimeout(aramaTimeout);
    const q = input.value.trim();
    if (q.length === 0) { sonuclariGizle(); urlGuncelle(''); return; }
    aramaTimeout = setTimeout(aramaYap, 400);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(aramaTimeout); aramaYap(); }
  });

  // Geri/ileri tuşu (browser history)
  window.addEventListener('popstate', () => urlRouteIsle());

  // Modal dışına tıklayınca kapat
  document.getElementById('videoModal').addEventListener('click', e => {
    if (e.target === document.getElementById('videoModal')) modalKapat();
  });

  // Şifre modalı — dışına tıklayınca kapat
  document.getElementById('sifreModal').addEventListener('click', e => {
    if (e.target === document.getElementById('sifreModal')) sifreModalKapat();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      modalKapat();
      sifreModalKapat();
    }
  });
});

// ─── URL ROUTER ──────────────────────────────────────────────────────────────
// /          → ana sayfa
// /ara?q=... → arama sonuçları
// /video/:id → direkt video aç
function urlRouteIsle() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  if (path.startsWith('/video/')) {
    const videoId = path.split('/video/')[1];
    if (videoId) videoIdIleAc(parseInt(videoId));
    return;
  }

  if (path === '/ara' || params.has('q')) {
    const q = params.get('q') || '';
    if (q) {
      document.getElementById('searchInput').value = q;
      aramaYap(false); // URL'i tekrar güncelleme
    }
    return;
  }

  // Ana sayfa — temiz
  sonuclariGizle();
}

// URL'i güncelle (history push)
function urlGuncelle(q, videoId) {
  if (videoId) {
    history.pushState({ videoId }, '', `/video/${videoId}`);
    return;
  }
  if (q) {
    history.pushState({ q }, '', `/ara?q=${encodeURIComponent(q)}`);
  } else {
    history.pushState({}, '', '/');
  }
}

// ─── AYARLAR ─────────────────────────────────────────────────────────────────
async function ayarlariYukle() {
  try {
    const r = await fetch('/api/ayarlar');
    const d = await r.json();
    if (d.site_basligi) {
      document.title = d.site_basligi;
      document.getElementById('siteBaslik').textContent = d.site_basligi;
    }
    if (d.site_logo_b64) {
      const img = document.getElementById('siteLogo');
      img.src = d.site_logo_b64;
      img.style.display = 'block';
    }
    sifreSistemiAktif = d.sifre_sistemi_aktif === '1';

    // İsimle arama ayarına göre input'u güncelle
    const isimleArama = d.isimle_arama_aktif === '1';
    const input = document.getElementById('searchInput');
    const hint = document.getElementById('searchHint');
    const aciklama = document.getElementById('heroAciklama');
    if (isimleArama) {
      input.type = 'text';
      input.placeholder = 'İsim, telefon veya etiket numarası yazın...';
      input.inputMode = '';
      if (hint) hint.innerHTML = '<i class="fas fa-info-circle"></i> İsim, telefon numarası veya etiket numarasıyla arayabilirsiniz.';
      if (aciklama) aciklama.textContent = 'İsim veya telefon numaranızı yazın, kurban kesim videonuzu izleyin';
    } else {
      input.type = 'tel';
      input.placeholder = 'Telefon numaranızı yazın... (05XX XXX XX XX)';
      input.inputMode = 'tel';
      if (hint) hint.innerHTML = '<i class="fas fa-info-circle"></i> Kayıtlı telefon numaranızı veya size verilen etiket numarasını girin.';
      if (aciklama) aciklama.textContent = 'Telefon numaranızı yazın, kurban kesim videonuzu izleyin';
    }
  } catch (e) {}
}

// ─── ORGANİZASYONLAR ─────────────────────────────────────────────────────────
async function organizasyonlariYukle() {
  try {
    const r = await fetch('/api/organizasyonlar');
    const orgs = await r.json();
    if (orgs.length > 1) {
      const sel = document.getElementById('orgSelect');
      orgs.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = `${o.ad} (${o.yil})`;
        sel.appendChild(opt);
      });
      document.getElementById('orgSelectorWrap').style.display = 'block';
    }
    const aktifR = await fetch('/api/aktif-organizasyon');
    const aktifD = await aktifR.json();
    if (aktifD.organizasyon) {
      document.getElementById('orgSelect').value = aktifD.organizasyon.id;
    }
  } catch (e) {}
}

// ─── ARAMA ───────────────────────────────────────────────────────────────────
async function aramaYap(guncelleUrl = true) {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) { sonuclariGizle(); urlGuncelle(''); return; }

  const orgId = document.getElementById('orgSelect')?.value || '';
  if (guncelleUrl) urlGuncelle(q);

  yuklemeyiGoster();

  try {
    const params = new URLSearchParams({ q });
    if (orgId) params.set('org_id', orgId);
    const r = await fetch('/api/ara?' + params.toString());
    const d = await r.json();
    tumVideolar = d.sonuclar || [];
    sonuclariGoster(tumVideolar, q);
  } catch (e) {
    yuklemeyiGizle();
    toast('Arama sırasında hata oluştu', 'error');
  }
}

function sonuclariGizle() {
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('loadingState').style.display = 'none';
}

function yuklemeyiGoster() {
  document.getElementById('loadingState').style.display = 'block';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
}

function yuklemeyiGizle() {
  document.getElementById('loadingState').style.display = 'none';
}

function sonuclariGoster(sonuclar, q) {
  yuklemeyiGizle();

  if (sonuclar.length === 0) {
    document.getElementById('emptyTitle').textContent = `"${q}" için sonuç bulunamadı`;
    document.getElementById('emptyDesc').textContent = 'Farklı bir numara deneyin veya organizasyon seçin';
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    return;
  }

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultsSection').style.display = 'block';
  document.getElementById('resultsCount').innerHTML =
    `<span>${sonuclar.length}</span> video bulundu — "<strong>${escHtml(q)}</strong>"`;

  const grid = document.getElementById('videoGrid');
  grid.innerHTML = '';

  sonuclar.forEach(v => {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.onclick = () => videoAc(v, q);

    const thumbHtml = v.thumbnail_url
      ? `<img src="${escHtml(v.thumbnail_url)}" alt="Thumbnail" loading="lazy"
           onerror="this.parentElement.innerHTML='<div class=video-thumb-placeholder><i class=fas\\ fa-video></i></div>'">`
      : `<div class="video-thumb-placeholder"><i class="fas fa-video"></i></div>`;

    card.innerHTML = `
      <div class="video-thumb">
        ${thumbHtml}
        <div class="play-overlay">
          <div class="play-btn-big"><i class="fas fa-play"></i></div>
        </div>
      </div>
      <div class="video-info">
        <div class="video-owner">${escHtml(v.bagisci_adi)}</div>
        <div class="video-meta">
          <span>${escHtml(v.organizasyon_adi || '')}</span>
          <span class="video-no-badge">${v.video_no}. Video</span>
          ${v.baslik ? `<span>${escHtml(v.baslik)}</span>` : ''}
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ─── VİDEO AÇ (ID ile — direkt link) ────────────────────────────────────────
async function videoIdIleAc(id) {
  // Önce cache'de ara
  let v = tumVideolar.find(x => x.id === id);

  // Cache'de yoksa API'den çek
  if (!v) {
    try {
      yuklemeyiGoster();
      const r = await fetch('/api/video/' + id);
      if (r.ok) {
        v = await r.json();
        yuklemeyiGizle();
      } else {
        yuklemeyiGizle();
        toast('Video bulunamadı', 'error');
        return;
      }
    } catch (e) {
      yuklemeyiGizle();
      toast('Video yüklenemedi', 'error');
      return;
    }
  }

  videoAc(v, v.bagisci_adi, false); // URL'i tekrar güncelleme
}

// ─── VİDEO MODAL ─────────────────────────────────────────────────────────────
function videoAc(v, arananIsim, guncelleUrl = true) {
  // Şifre sistemi aktifse ve henüz doğrulanmamışsa önce telefon sor
  if (sifreSistemiAktif && !dogrulanmisTelefon) {
    bekleyenVideo = { v, arananIsim, guncelleUrl };
    sifreModalAc();
    return;
  }

  _videoAcGercek(v, arananIsim, guncelleUrl);
}

function _videoAcGercek(v, arananIsim, guncelleUrl) {
  aktifVideo = v;

  if (guncelleUrl) urlGuncelle(null, v.id);

  document.getElementById('modalTitle').textContent =
    v.baslik || (v.bagisci_adi + ' - Kurban Videosu');
  document.getElementById('modalOwner').textContent = v.bagisci_adi;
  document.getElementById('modalOrg').textContent = v.organizasyon_adi || '';
  document.getElementById('modalVideoNo').textContent = v.video_no + '. Video';

  const video = document.getElementById('modalVideo');
  video.src = v.cloudinary_url;
  video.load();

  document.getElementById('videoModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // İzleme logu
  fetch('/api/izleme-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_id: v.id,
      bagisci_id: v.bagisci_id,
      aranan_isim: arananIsim || document.getElementById('searchInput').value.trim()
    })
  }).catch(() => {});
}

// ─── ŞİFRE MODALI ────────────────────────────────────────────────────────────
function sifreModalAc() {
  const modal = document.getElementById('sifreModal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('sifreTelefonInput').value = '';
  document.getElementById('sifreHata').textContent = '';
  document.getElementById('sifreTelefonInput').focus();
}

function sifreModalKapat() {
  document.getElementById('sifreModal').classList.add('hidden');
  document.body.style.overflow = '';
  bekleyenVideo = null;
}

async function sifreDogrula() {
  const input = document.getElementById('sifreTelefonInput');
  const telefon = input.value.trim();
  if (!telefon) {
    document.getElementById('sifreHata').textContent = 'Lütfen telefon numaranızı girin.';
    return;
  }

  const btn = document.getElementById('sifreDogrulaBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kontrol ediliyor...';
  document.getElementById('sifreHata').textContent = '';

  try {
    const r = await fetch('/api/sifre-kontrol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefon })
    });
    const d = await r.json();

    if (r.ok && d.ok) {
      dogrulanmisTelefon = telefon;
      document.getElementById('sifreModal').classList.add('hidden');
      document.body.style.overflow = '';

      // Bekleyen videoyu aç
      if (bekleyenVideo) {
        const { v, arananIsim, guncelleUrl } = bekleyenVideo;
        bekleyenVideo = null;
        _videoAcGercek(v, arananIsim, guncelleUrl);
      }
    } else {
      document.getElementById('sifreHata').textContent =
        d.hata || 'Bu numaraya ait kayıt bulunamadı.';
    }
  } catch (e) {
    document.getElementById('sifreHata').textContent = 'Bağlantı hatası, tekrar deneyin.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Doğrula';
  }
}

function modalKapat() {
  const video = document.getElementById('modalVideo');
  video.pause();
  video.src = '';
  document.getElementById('videoModal').classList.add('hidden');
  document.body.style.overflow = '';

  // URL'i geri al — arama varsa /ara?q=... yoksa /
  const q = document.getElementById('searchInput').value.trim();
  if (q) {
    history.replaceState({ q }, '', `/ara?q=${encodeURIComponent(q)}`);
  } else {
    history.replaceState({}, '', '/');
  }

  aktifVideo = null;
}

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, tip = 'info', sure = 3500) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${tip}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), sure);
}
