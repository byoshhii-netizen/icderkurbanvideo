'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────────
let aramaTimeout = null;
let aktifVideo = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await ayarlariYukle();
  await organizasyonlariYukle();

  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    clearTimeout(aramaTimeout);
    const q = input.value.trim();
    if (q.length === 0) {
      sonuclariGizle();
      return;
    }
    aramaTimeout = setTimeout(aramaYap, 400);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(aramaTimeout); aramaYap(); }
  });

  // Modal dışına tıklayınca kapat
  document.getElementById('videoModal').addEventListener('click', e => {
    if (e.target === document.getElementById('videoModal')) modalKapat();
  });

  // ESC ile kapat
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') modalKapat();
  });
});

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
    // Aktif organizasyonu seç
    const aktifR = await fetch('/api/aktif-organizasyon');
    const aktifD = await aktifR.json();
    if (aktifD.organizasyon) {
      document.getElementById('orgSelect').value = aktifD.organizasyon.id;
    }
  } catch (e) {}
}

// ─── ARAMA ───────────────────────────────────────────────────────────────────
async function aramaYap() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) { sonuclariGizle(); return; }

  const orgId = document.getElementById('orgSelect')?.value || '';

  yuklemeyiGoster();

  try {
    const params = new URLSearchParams({ q });
    if (orgId) params.set('org_id', orgId);
    const r = await fetch('/api/ara?' + params.toString());
    const d = await r.json();
    sonuclariGoster(d.sonuclar || [], q);
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
    document.getElementById('emptyDesc').textContent = 'Farklı bir yazım deneyin veya organizasyon seçin';
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    return;
  }

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultsSection').style.display = 'block';
  document.getElementById('resultsCount').innerHTML =
    `<span>${sonuclar.length}</span> video bulundu — "<strong>${q}</strong>"`;

  const grid = document.getElementById('videoGrid');
  grid.innerHTML = '';

  sonuclar.forEach(v => {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.onclick = () => videoAc(v, q);

    const thumbHtml = v.thumbnail_url
      ? `<img src="${v.thumbnail_url}" alt="Thumbnail" loading="lazy" onerror="this.parentElement.innerHTML='<div class=video-thumb-placeholder><i class=fas fa-video></i></div>'">`
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

// ─── VİDEO MODAL ─────────────────────────────────────────────────────────────
function videoAc(v, arananIsim) {
  aktifVideo = v;
  document.getElementById('modalTitle').textContent = v.baslik || (v.bagisci_adi + ' - Kurban Videosu');
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

function modalKapat() {
  const video = document.getElementById('modalVideo');
  video.pause();
  video.src = '';
  document.getElementById('videoModal').classList.add('hidden');
  document.body.style.overflow = '';
  aktifVideo = null;
}

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, tip = 'info', sure = 3500) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${tip}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), sure);
}
