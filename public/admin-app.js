'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────────
let aktifSayfa = 'dashboard';
let organizasyonlar = [];
let bagisciAramaTimeout = null;
let videoAramaTimeout = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await adminDurumKontrol();
  await organizasyonlariYukle();
  await ayarlariYukle();
  sayfaGit('dashboard');
});

async function adminDurumKontrol() {
  try {
    const r = await fetch('/api/admin/durum', { credentials: 'include' });
    const d = await r.json();
    if (!d.girisYapildi) window.location.href = '/admin-giris';
  } catch (e) {
    console.error('Admin durum kontrol hatası:', e);
    window.location.href = '/admin-giris';
  }
}

// ─── SAYFA NAVİGASYON ─────────────────────────────────────────────────────────
function sayfaGit(sayfa) {
  aktifSayfa = sayfa;
  const sayfalar = ['dashboard', 'organizasyonlar', 'bagiscilar', 'videolar', 'izleme', 'ayarlar'];
  sayfalar.forEach(s => {
    const el = document.getElementById('page-' + s);
    const nav = document.getElementById('nav-' + s);
    if (el) el.style.display = s === sayfa ? 'block' : 'none';
    if (nav) nav.classList.toggle('active', s === sayfa);
  });

  const basliklar = {
    dashboard: 'Dashboard',
    organizasyonlar: 'Organizasyonlar',
    bagiscilar: 'Bağışçılar',
    videolar: 'Kurban Videoları',
    izleme: 'İzleme Logları',
    ayarlar: 'Ayarlar'
  };
  document.getElementById('topbarTitle').textContent = basliklar[sayfa] || sayfa;
  sidebarKapat();

  if (sayfa === 'dashboard') dashboardYukle();
  else if (sayfa === 'organizasyonlar') organizasyonTabloYukle();
  else if (sayfa === 'bagiscilar') bagiscilarYukle();
  else if (sayfa === 'videolar') videolarYukle();
  else if (sayfa === 'izleme') { izlemeOrgFilterDoldur(); izlemeLoglariniYukle(); }
  else if (sayfa === 'ayarlar') { ayarlariYukle(); setTimeout(() => { topluVeAktarOrgDoldur(); icderOrglariYukle(); }, 200); }
}

// ─── SIDEBAR MOBILE ───────────────────────────────────────────────────────────
function sidebarAc() {
  document.getElementById('adminSidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}
function sidebarKapat() {
  document.getElementById('adminSidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ─── ÇIKIŞ ───────────────────────────────────────────────────────────────────
async function cikisYap() {
  await fetch('/api/admin/cikis', { method: 'POST' });
  window.location.href = '/admin-giris';
}

// ─── AYARLAR ─────────────────────────────────────────────────────────────────
async function ayarlariYukle() {
  try {
    const r = await fetch('/api/admin/ayarlar');
    const d = await r.json();

    if (d.admin_logo_b64) {
      const img = document.getElementById('adminLogoImg');
      if (img) { img.src = d.admin_logo_b64; img.style.display = 'block'; }
      const prev = document.getElementById('adminLogoPreview');
      if (prev) { prev.src = d.admin_logo_b64; prev.style.display = 'block'; document.getElementById('adminLogoYok').style.display = 'none'; }
    }
    if (d.site_logo_b64) {
      const prev = document.getElementById('siteLogoPreview');
      if (prev) { prev.src = d.site_logo_b64; prev.style.display = 'block'; document.getElementById('siteLogoYok').style.display = 'none'; }
    }
    if (d.site_basligi) {
      const inp = document.getElementById('siteBaslikInput');
      if (inp) inp.value = d.site_basligi;
    }
    if (d.sifre_sistemi_aktif) {
      const tog = document.getElementById('sifreSistemiToggle');
      if (tog) {
        tog.checked = d.sifre_sistemi_aktif === '1';
        document.getElementById('sifreSistemiDurum').textContent = tog.checked ? 'Aktif' : 'Kapalı';
      }
    }
  } catch (e) {}
}

// ─── ORGANİZASYONLAR ─────────────────────────────────────────────────────────
async function organizasyonlariYukle() {
  try {
    const r = await fetch('/api/admin/organizasyonlar');
    organizasyonlar = await r.json();
    // Filtreleri doldur
    ['bagisciOrgFilter', 'videoOrgFilter'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const mevcut = sel.value;
      sel.innerHTML = '<option value="">Tüm organizasyonlar</option>';
      organizasyonlar.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = `${o.ad} (${o.yil})`;
        sel.appendChild(opt);
      });
      if (mevcut) sel.value = mevcut;
    });
  } catch (e) {}
}

async function organizasyonTabloYukle() {
  await organizasyonlariYukle();
  const tbody = document.getElementById('orgTableBody');
  if (!tbody) return;

  // Aktif org id
  let aktifOrgId = '';
  try {
    const r = await fetch('/api/admin/ayarlar');
    const d = await r.json();
    aktifOrgId = d.aktif_organizasyon_id || '';
  } catch (e) {}

  tbody.innerHTML = '';
  if (organizasyonlar.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text3); padding:24px;">Henüz organizasyon yok</td></tr>';
    return;
  }
  organizasyonlar.forEach(o => {
    const isAktif = String(o.id) === String(aktifOrgId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600; color:var(--text)">${escHtml(o.ad)}</td>
      <td>${o.yil}</td>
      <td><span class="badge badge-gray">${o.bagisci_sayisi || 0}</span></td>
      <td><span class="badge badge-green">${o.video_sayisi || 0}</span></td>
      <td>${o.aktif ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-gray">Pasif</span>'}</td>
      <td>
        ${isAktif
          ? '<span class="badge badge-green"><i class="fas fa-check"></i> Seçili</span>'
          : `<button class="btn btn-ghost btn-sm" onclick="aktifOrgSec(${o.id})"><i class="fas fa-star"></i> Seç</button>`
        }
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="orgDuzenle(${o.id})" title="Düzenle"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="orgSil(${o.id})" title="Sil"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function dashboardYukle() {
  try {
    const r = await fetch('/api/admin/dashboard');
    const d = await r.json();
    const grid = document.getElementById('statsGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-icon"><i class="fas fa-sitemap"></i></div>
        <div class="stat-card-value">${d.orgSayisi}</div>
        <div class="stat-card-label">Organizasyon</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon"><i class="fas fa-users"></i></div>
        <div class="stat-card-value">${d.bagisciSayisi}</div>
        <div class="stat-card-label">Bağışçı</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon"><i class="fas fa-video"></i></div>
        <div class="stat-card-value">${d.videoSayisi}</div>
        <div class="stat-card-label">Video</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon"><i class="fas fa-eye"></i></div>
        <div class="stat-card-value">${d.izlenmeSayisi}</div>
        <div class="stat-card-label">İzlenme</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon"><i class="fas fa-search"></i></div>
        <div class="stat-card-value">${d.aramaSayisi}</div>
        <div class="stat-card-label">Arama</div>
      </div>
    `;
    const sonAramalar = document.getElementById('sonAramalarList');
    if (sonAramalar) {
      if (!d.sonAramalar || d.sonAramalar.length === 0) {
        sonAramalar.innerHTML = '<p style="color:var(--text3); font-size:0.85rem;">Henüz arama yapılmamış</p>';
      } else {
        sonAramalar.innerHTML = d.sonAramalar.map(a => `
          <div style="display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border);">
            <i class="fas fa-search" style="color:var(--text3); width:16px;"></i>
            <span style="flex:1; font-size:0.9rem;">${escHtml(a.aranan_isim || '-')}</span>
            <span style="font-size:0.75rem; color:var(--text3);">${escHtml(a.ip_adresi || '')}</span>
            <span style="font-size:0.75rem; color:var(--text3);">${tarihFormat(a.tarih)}</span>
          </div>
        `).join('');
      }
    }
  } catch (e) {}
}

// ─── ORG EKLE/DÜZENLE ─────────────────────────────────────────────────────────
function orgEkleModal() {
  modalGoster(`
    <div class="modal-header">
      <div class="modal-title">Yeni Organizasyon</div>
      <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:20px;">
      <div class="form-group">
        <label class="form-label">Organizasyon Adı *</label>
        <input type="text" class="form-input" id="orgAdInput" placeholder="örn: 2025 Kurban Organizasyonu">
      </div>
      <div class="form-group">
        <label class="form-label">Yıl</label>
        <input type="number" class="form-input" id="orgYilInput" value="${new Date().getFullYear()}">
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
        <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
        <button class="btn btn-primary" onclick="orgKaydet()"><i class="fas fa-save"></i> Kaydet</button>
      </div>
    </div>
  `);
}

async function orgKaydet() {
  const ad = document.getElementById('orgAdInput')?.value?.trim();
  const yil = document.getElementById('orgYilInput')?.value;
  if (!ad) { toast('Organizasyon adı gerekli', 'error'); return; }
  try {
    const r = await fetch('/api/admin/organizasyonlar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad, yil: parseInt(yil) })
    });
    const d = await r.json();
    if (d.ok) {
      toast('Organizasyon eklendi', 'success');
      modalKapat();
      await organizasyonTabloYukle();
    } else {
      toast(d.hata || 'Hata', 'error');
    }
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

function orgDuzenle(id) {
  const org = organizasyonlar.find(o => o.id === id);
  if (!org) return;
  modalGoster(`
    <div class="modal-header">
      <div class="modal-title">Organizasyon Düzenle</div>
      <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:20px;">
      <div class="form-group">
        <label class="form-label">Organizasyon Adı *</label>
        <input type="text" class="form-input" id="orgAdInput" value="${escHtml(org.ad)}">
      </div>
      <div class="form-group">
        <label class="form-label">Yıl</label>
        <input type="number" class="form-input" id="orgYilInput" value="${org.yil}">
      </div>
      <div class="form-group">
        <label class="form-label">Durum</label>
        <select class="form-select" id="orgAktifInput">
          <option value="1" ${org.aktif ? 'selected' : ''}>Aktif</option>
          <option value="0" ${!org.aktif ? 'selected' : ''}>Pasif</option>
        </select>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
        <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
        <button class="btn btn-primary" onclick="orgGuncelle(${id})"><i class="fas fa-save"></i> Güncelle</button>
      </div>
    </div>
  `);
}

async function orgGuncelle(id) {
  const ad = document.getElementById('orgAdInput')?.value?.trim();
  const yil = document.getElementById('orgYilInput')?.value;
  const aktif = document.getElementById('orgAktifInput')?.value;
  if (!ad) { toast('Ad gerekli', 'error'); return; }
  try {
    const r = await fetch('/api/admin/organizasyonlar/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad, yil: parseInt(yil), aktif: aktif === '1' })
    });
    const d = await r.json();
    if (d.ok) { toast('Güncellendi', 'success'); modalKapat(); await organizasyonTabloYukle(); }
    else toast(d.hata || 'Hata', 'error');
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

async function orgSil(id) {
  if (!confirm('Bu organizasyonu silmek istediğinizden emin misiniz? Tüm bağışçı ve videolar da silinir!')) return;
  try {
    const r = await fetch('/api/admin/organizasyonlar/' + id, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) { toast('Silindi', 'success'); await organizasyonTabloYukle(); }
    else toast(d.hata || 'Hata', 'error');
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

async function aktifOrgSec(id) {
  try {
    const r = await fetch('/api/admin/aktif-organizasyon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: id })
    });
    const d = await r.json();
    if (d.ok) { toast('Aktif organizasyon güncellendi', 'success'); await organizasyonTabloYukle(); }
    else toast(d.hata || 'Hata', 'error');
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

// ─── BAĞIŞÇILAR ───────────────────────────────────────────────────────────────
async function bagiscilarYukle() {
  const orgId = document.getElementById('bagisciOrgFilter')?.value || '';
  const videoDurum = document.getElementById('bagisciVideoDurum')?.value || '';
  const q = document.getElementById('bagisciArama')?.value?.trim() || '';
  const tbody = document.getElementById('bagisciTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;"><div class="spinner" style="margin:auto;"></div></td></tr>';
  try {
    const params = new URLSearchParams();
    if (orgId) params.set('org_id', orgId);
    if (videoDurum) params.set('video_durum', videoDurum);
    if (q) params.set('q', q);
    const r = await fetch('/api/admin/bagiscilar?' + params.toString());
    const bagiscilar = await r.json();
    tbody.innerHTML = '';
    if (bagiscilar.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text3); padding:24px;">Bağışçı bulunamadı</td></tr>';
      return;
    }
    bagiscilar.forEach(b => {
      const tr = document.createElement('tr');
      tr.className = b.video_var ? 'bagisci-row-green' : 'bagisci-row-red';
      tr.innerHTML = `
        <td>
          ${b.video_var
            ? '<span class="dot-green"></span><span class="badge badge-green" style="font-size:0.7rem;">Video Var</span>'
            : '<span class="dot-red"></span><span class="badge badge-red" style="font-size:0.7rem;">Video Yok</span>'
          }
        </td>
        <td style="font-weight:600; color:var(--text)">${escHtml(b.ad)}</td>
        <td style="font-family:monospace; font-size:0.85rem;">${escHtml(b.telefon || '-')}</td>
        <td style="font-size:0.85rem; color:var(--text3)">${escHtml(b.organizasyon_adi || '')}</td>
        <td>
          ${b.video_sayisi > 0
            ? `<span class="video-count-badge">${b.video_sayisi}</span>`
            : '<span style="color:var(--text3)">0</span>'
          }
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="bagisciDuzenle(${b.id})" title="Düzenle"><i class="fas fa-edit"></i></button>
            <button class="btn btn-primary btn-sm" onclick="bagisciVideoEkle(${b.id}, '${escHtml(b.ad)}')" title="Video Ekle">
              <i class="fas fa-plus"></i> Video
            </button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="bagisciSil(${b.id})" title="Sil"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--red); padding:24px;">Yükleme hatası</td></tr>';
  }
}

function bagisciAramaDebounce() {
  clearTimeout(bagisciAramaTimeout);
  bagisciAramaTimeout = setTimeout(bagiscilarYukle, 400);
}

function bagisciEkleModal() {
  const orgOptions = organizasyonlar.map(o =>
    `<option value="${o.id}">${escHtml(o.ad)} (${o.yil})</option>`
  ).join('');
  modalGoster(`
    <div class="modal-header">
      <div class="modal-title">Bağışçı Ekle</div>
      <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:20px;">
      <div class="form-group">
        <label class="form-label">Ad Soyad *</label>
        <input type="text" class="form-input" id="bagisciAdInput" placeholder="Ahmet Yılmaz">
      </div>
      <div class="form-group">
        <label class="form-label">Telefon <small style="color:var(--text3)">(+90 otomatik eklenir)</small></label>
        <input type="tel" class="form-input" id="bagisciTelInput" placeholder="5XX XXX XX XX">
      </div>
      <div class="form-group">
        <label class="form-label">Organizasyon *</label>
        <select class="form-select" id="bagisciOrgInput">${orgOptions}</select>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
        <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
        <button class="btn btn-primary" onclick="bagisciKaydet()"><i class="fas fa-save"></i> Kaydet</button>
      </div>
    </div>
  `);
}

async function bagisciKaydet() {
  const ad = document.getElementById('bagisciAdInput')?.value?.trim();
  const telefon = document.getElementById('bagisciTelInput')?.value?.trim();
  const organizasyon_id = document.getElementById('bagisciOrgInput')?.value;
  if (!ad || !organizasyon_id) { toast('Ad ve organizasyon gerekli', 'error'); return; }
  try {
    const r = await fetch('/api/admin/bagiscilar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad, telefon, organizasyon_id })
    });
    const d = await r.json();
    if (d.ok) { toast('Bağışçı eklendi', 'success'); modalKapat(); bagiscilarYukle(); }
    else toast(d.hata || 'Hata', 'error');
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

function bagisciDuzenle(id) {
  // Önce bağışçı bilgilerini çek
  fetch('/api/admin/bagiscilar?q=&org_id=').then(r => r.json()).then(liste => {
    // Tüm bağışçılardan bul
    fetch('/api/admin/bagiscilar').then(r2 => r2.json()).then(tumListe => {
      const b = tumListe.find(x => x.id === id);
      if (!b) return;
      const orgOptions = organizasyonlar.map(o =>
        `<option value="${o.id}" ${o.id === b.organizasyon_id ? 'selected' : ''}>${escHtml(o.ad)} (${o.yil})</option>`
      ).join('');
      modalGoster(`
        <div class="modal-header">
          <div class="modal-title">Bağışçı Düzenle</div>
          <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="padding:20px;">
          <div class="form-group">
            <label class="form-label">Ad Soyad *</label>
            <input type="text" class="form-input" id="bagisciAdInput" value="${escHtml(b.ad)}">
          </div>
          <div class="form-group">
            <label class="form-label">Telefon</label>
            <input type="tel" class="form-input" id="bagisciTelInput" value="${escHtml(b.telefon || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Organizasyon *</label>
            <select class="form-select" id="bagisciOrgInput">${orgOptions}</select>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
            <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
            <button class="btn btn-primary" onclick="bagisciGuncelle(${id})"><i class="fas fa-save"></i> Güncelle</button>
          </div>
        </div>
      `);
    });
  });
}

async function bagisciGuncelle(id) {
  const ad = document.getElementById('bagisciAdInput')?.value?.trim();
  const telefon = document.getElementById('bagisciTelInput')?.value?.trim();
  const organizasyon_id = document.getElementById('bagisciOrgInput')?.value;
  if (!ad) { toast('Ad gerekli', 'error'); return; }
  try {
    const r = await fetch('/api/admin/bagiscilar/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad, telefon, organizasyon_id })
    });
    const d = await r.json();
    if (d.ok) { toast('Güncellendi', 'success'); modalKapat(); bagiscilarYukle(); }
    else toast(d.hata || 'Hata', 'error');
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

async function bagisciSil(id) {
  if (!confirm('Bu bağışçıyı ve tüm videolarını silmek istediğinizden emin misiniz?')) return;
  try {
    const r = await fetch('/api/admin/bagiscilar/' + id, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) { toast('Silindi', 'success'); bagiscilarYukle(); }
    else toast(d.hata || 'Hata', 'error');
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

// ─── VİDEOLAR ─────────────────────────────────────────────────────────────────
async function videolarYukle() {
  const orgId = document.getElementById('videoOrgFilter')?.value || '';
  const q = document.getElementById('videoArama')?.value?.trim() || '';
  const tbody = document.getElementById('videoTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;"><div class="spinner" style="margin:auto;"></div></td></tr>';
  try {
    const params = new URLSearchParams();
    if (orgId) params.set('org_id', orgId);
    if (q) params.set('q', q);
    const r = await fetch('/api/admin/videolar?' + params.toString());
    const videolar = await r.json();
    tbody.innerHTML = '';
    if (videolar.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text3); padding:24px;">Video bulunamadı</td></tr>';
      return;
    }
    videolar.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          ${v.thumbnail_url
            ? `<img src="${escHtml(v.thumbnail_url)}" style="width:80px; height:50px; object-fit:cover; border-radius:6px; border:1px solid var(--border);" onerror="this.style.display='none'">`
            : `<div style="width:80px; height:50px; background:var(--bg4); border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--text3);"><i class="fas fa-video"></i></div>`
          }
        </td>
        <td style="font-weight:600; color:var(--text)">${escHtml(v.bagisci_adi)}</td>
        <td style="font-size:0.8rem; color:var(--text3)">${escHtml(v.organizasyon_adi || '')}</td>
        <td>
          <div style="font-size:0.85rem;">${escHtml(v.baslik || '-')}</div>
          ${v.arama_etiketleri ? `<div style="font-size:0.75rem; color:var(--text3); margin-top:2px;">${escHtml(v.arama_etiketleri)}</div>` : ''}
        </td>
        <td><span class="video-no-badge">${v.video_no}. Video</span></td>
        <td style="font-size:0.8rem; color:var(--text3)">${tarihFormat(v.olusturma)}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="videoDuzenle(${v.id})" title="Düzenle"><i class="fas fa-edit"></i></button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="videoLinkKopyala(${v.id})" title="Linki Kopyala"><i class="fas fa-link"></i></button>
            <a href="${escHtml(v.cloudinary_url)}" target="_blank" class="btn btn-ghost btn-sm btn-icon" title="İzle"><i class="fas fa-play"></i></a>
            <button class="btn btn-danger btn-sm btn-icon" onclick="videoSil(${v.id}, '${escHtml(v.cloudinary_public_id)}')" title="Sil"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--red); padding:24px;">Yükleme hatası</td></tr>';
  }
}

function videoAramaDebounce() {
  clearTimeout(videoAramaTimeout);
  videoAramaTimeout = setTimeout(videolarYukle, 400);
}

function videoEkleModal(bagisciIdOnceden, bagisciAdOnceden) {
  const orgOptions = organizasyonlar.map(o =>
    `<option value="${o.id}">${escHtml(o.ad)} (${o.yil})</option>`
  ).join('');
  modalGoster(`
    <div class="modal-header">
      <div class="modal-title">Video Ekle</div>
      <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:20px;">
      <div class="form-group">
        <label class="form-label">Organizasyon *</label>
        <select class="form-select" id="videoOrgInput" onchange="videoBagisciListeYukle()">${orgOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Bağışçı *</label>
        <select class="form-select" id="videoBagisciInput">
          <option value="">Önce organizasyon seçin</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Video Başlığı <small style="color:var(--text3)">(opsiyonel)</small></label>
        <input type="text" class="form-input" id="videoBaslikInput" placeholder="örn: Büyükbaş Kurban Kesimi">
      </div>
      <div class="form-group">
        <label class="form-label">Arama Etiketleri <small style="color:var(--text3)">(virgülle ayırın)</small></label>
        <input type="text" class="form-input" id="videoEtiketInput" placeholder="örn: ahmet, yılmaz, büyükbaş, 2025">
      </div>
      <div class="form-group">
        <label class="form-label">Video Dosyası *</label>
        <div class="upload-area" id="uploadArea" onclick="document.getElementById('videoFileInput').click()" ondragover="dragOver(event)" ondrop="dropVideo(event)">
          <i class="fas fa-cloud-upload-alt"></i>
          <p>Tıklayın veya sürükleyip bırakın</p>
          <small>MP4, MOV, WebM — Maks 500MB</small>
        </div>
        <input type="file" id="videoFileInput" accept="video/*" style="display:none" onchange="videoSecildi(this)">
        <div class="upload-progress" id="uploadProgress">
          <div class="upload-progress-bar" id="uploadProgressBar"></div>
        </div>
        <div id="uploadStatus" style="font-size:0.85rem; color:var(--text3); margin-top:8px;"></div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
        <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
        <button class="btn btn-primary" id="videoKaydetBtn" onclick="videoKaydet()" disabled>
          <i class="fas fa-save"></i> Kaydet
        </button>
      </div>
    </div>
  `);

  // Eğer bağışçı önceden seçiliyse
  if (bagisciIdOnceden) {
    setTimeout(() => {
      videoBagisciListeYukle().then(() => {
        const sel = document.getElementById('videoBagisciInput');
        if (sel) sel.value = bagisciIdOnceden;
      });
    }, 100);
  } else {
    videoBagisciListeYukle();
  }
}

// Bağışçı listesini organizasyona göre yükle
async function videoBagisciListeYukle() {
  const orgId = document.getElementById('videoOrgInput')?.value;
  const sel = document.getElementById('videoBagisciInput');
  if (!sel) return;
  sel.innerHTML = '<option value="">Yükleniyor...</option>';
  try {
    const r = await fetch('/api/admin/bagiscilar?org_id=' + (orgId || ''));
    const liste = await r.json();
    sel.innerHTML = '<option value="">Bağışçı seçin</option>';
    liste.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.ad + (b.telefon ? ` (${b.telefon})` : '');
      sel.appendChild(opt);
    });
  } catch (e) {
    sel.innerHTML = '<option value="">Yükleme hatası</option>';
  }
}

// Drag & drop
function dragOver(e) { e.preventDefault(); document.getElementById('uploadArea').classList.add('drag-over'); }
function dropVideo(e) {
  e.preventDefault();
  document.getElementById('uploadArea').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) videoSecildiDosya(file);
}

let yuklenenVideoData = null;

function videoSecildi(input) {
  if (input.files[0]) videoSecildiDosya(input.files[0]);
}

function videoSecildiDosya(file) {
  const status = document.getElementById('uploadStatus');
  const area = document.getElementById('uploadArea');
  if (!file.type.startsWith('video/')) { toast('Sadece video dosyası yükleyebilirsiniz', 'error'); return; }
  if (file.size > 500 * 1024 * 1024) { toast('Dosya 500MB\'dan büyük olamaz', 'error'); return; }
  area.innerHTML = `<i class="fas fa-file-video" style="color:var(--accent)"></i><p style="color:var(--accent)">${escHtml(file.name)}</p><small>${(file.size / 1024 / 1024).toFixed(1)} MB</small>`;
  status.textContent = 'Yüklemeye hazır. "Kaydet" butonuna basın.';
  yuklenenVideoData = file;
  document.getElementById('videoKaydetBtn').disabled = false;
}

async function videoKaydet() {
  const bagisciId = document.getElementById('videoBagisciInput')?.value;
  const orgId = document.getElementById('videoOrgInput')?.value;
  const baslik = document.getElementById('videoBaslikInput')?.value?.trim();
  const etiketler = document.getElementById('videoEtiketInput')?.value?.trim();
  if (!bagisciId) { toast('Bağışçı seçin', 'error'); return; }
  if (!yuklenenVideoData) { toast('Video dosyası seçin', 'error'); return; }

  const btn = document.getElementById('videoKaydetBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yükleniyor...';

  const progress = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('uploadProgressBar');
  const status = document.getElementById('uploadStatus');
  progress.style.display = 'block';

  try {
    // Cloudinary'ye yükle
    const formData = new FormData();
    formData.append('video', yuklenenVideoData);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round(e.loaded / e.total * 100);
        progressBar.style.width = pct + '%';
        status.textContent = `Yükleniyor... %${pct}`;
      }
    };

    const uploadResult = await new Promise((resolve, reject) => {
      xhr.onload = () => {
        try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(new Error('Yanıt parse hatası')); }
      };
      xhr.onerror = () => reject(new Error('Ağ hatası'));
      xhr.open('POST', '/api/medya/upload');
      xhr.send(formData);
    });

    if (uploadResult.hata) throw new Error(uploadResult.hata);

    status.textContent = 'Video yüklendi, kaydediliyor...';
    progressBar.style.width = '100%';

    // DB'ye kaydet
    const r = await fetch('/api/admin/videolar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bagisci_id: bagisciId,
        organizasyon_id: orgId,
        baslik: baslik || null,
        arama_etiketleri: etiketler || null,
        cloudinary_url: uploadResult.url,
        cloudinary_public_id: uploadResult.public_id,
        thumbnail_url: uploadResult.thumbnail_url || null,
        sure: uploadResult.duration || 0,
        boyut: uploadResult.bytes || 0,
      })
    });
    const d = await r.json();
    if (d.ok) {
      toast('Video başarıyla eklendi!', 'success');
      yuklenenVideoData = null;
      modalKapat();
      videolarYukle();
      bagiscilarYukle();
    } else {
      throw new Error(d.hata || 'Kayıt hatası');
    }
  } catch (e) {
    toast('Hata: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Kaydet';
    progress.style.display = 'none';
  }
}

function bagisciVideoEkle(bagisciId, bagisciAd) {
  sayfaGit('videolar');
  setTimeout(() => videoEkleModal(bagisciId, bagisciAd), 100);
}

function videoDuzenle(id) {
  fetch('/api/admin/videolar').then(r => r.json()).then(liste => {
    const v = liste.find(x => x.id === id);
    if (!v) return;
    modalGoster(`
      <div class="modal-header">
        <div class="modal-title">Video Düzenle</div>
        <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="padding:20px;">
        <div class="form-group">
          <label class="form-label">Başlık</label>
          <input type="text" class="form-input" id="videoBaslikInput" value="${escHtml(v.baslik || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Arama Etiketleri</label>
          <input type="text" class="form-input" id="videoEtiketInput" value="${escHtml(v.arama_etiketleri || '')}">
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
          <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
          <button class="btn btn-primary" onclick="videoGuncelle(${id})"><i class="fas fa-save"></i> Güncelle</button>
        </div>
      </div>
    `);
  });
}

async function videoGuncelle(id) {
  const baslik = document.getElementById('videoBaslikInput')?.value?.trim();
  const etiketler = document.getElementById('videoEtiketInput')?.value?.trim();
  try {
    const r = await fetch('/api/admin/videolar/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baslik, arama_etiketleri: etiketler })
    });
    const d = await r.json();
    if (d.ok) { toast('Güncellendi', 'success'); modalKapat(); videolarYukle(); }
    else toast(d.hata || 'Hata', 'error');
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

async function videoSil(id, publicId) {
  if (!confirm('Bu videoyu silmek istediğinizden emin misiniz? Cloudinary\'den de silinecek.')) return;
  try {
    // Önce DB'den sil
    const r = await fetch('/api/admin/videolar/' + id, { method: 'DELETE' });
    const d = await r.json();
    if (!d.ok) { toast(d.hata || 'Silme hatası', 'error'); return; }
    // Cloudinary'den sil
    if (publicId) {
      await fetch('/api/medya/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: publicId, resource_type: 'video' })
      });
    }
    toast('Video silindi', 'success');
    videolarYukle();
    bagiscilarYukle();
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

// ─── İZLEME LOGLARI ──────────────────────────────────────────────────────────
function izlemeOrgFilterDoldur() {
  ['izlemeOrgFilter'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">Tüm organizasyonlar</option>';
    organizasyonlar.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.ad} (${o.yil})`;
      sel.appendChild(opt);
    });
  });
}

async function izlemeLoglariniYukle() {
  const tbody = document.getElementById('izlemeTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;"><div class="spinner" style="margin:auto;"></div></td></tr>';

  const orgId = document.getElementById('izlemeOrgFilter')?.value || '';
  const tur   = document.getElementById('izlemeTurFilter')?.value || '';

  try {
    const params = new URLSearchParams({ limit: 300 });
    if (orgId) params.set('org_id', orgId);
    if (tur === 'izleme') params.set('sadece_izleme', '1');
    if (tur === 'arama')  params.set('sadece_arama', '1');

    const r = await fetch('/api/admin/izleme-loglari?' + params.toString());
    const loglar = await r.json();
    tbody.innerHTML = '';
    if (loglar.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text3); padding:24px;">Henüz log yok</td></tr>';
      return;
    }
    loglar.forEach(l => {
      const isIzleme = !!l.video_id;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:0.8rem; color:var(--text3); white-space:nowrap;">${tarihFormat(l.tarih)}</td>
        <td style="font-weight:500;">${escHtml(l.aranan_isim || '-')}</td>
        <td style="font-size:0.85rem;">
          ${l.bagisci_adi ? `<strong>${escHtml(l.bagisci_adi)}</strong>` : ''}
          ${l.video_baslik ? `<span style="color:var(--text3)"> — ${escHtml(l.video_baslik)}</span>` : ''}
          ${!l.bagisci_adi && !l.video_baslik ? '<span style="color:var(--text3)">-</span>' : ''}
        </td>
        <td style="font-family:monospace; font-size:0.8rem; color:var(--text3);">${escHtml(l.ip_adresi || '-')}</td>
        <td><span class="badge ${isIzleme ? 'badge-green' : 'badge-yellow'}">${isIzleme ? 'İzleme' : 'Arama'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--red); padding:24px;">Yükleme hatası</td></tr>';
  }
}

// ─── AYARLAR ─────────────────────────────────────────────────────────────────
async function logoYukle(tip, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('Logo 2MB\'dan küçük olmalı', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = e.target.result;
    try {
      const r = await fetch('/api/admin/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tip, data })
      });
      const d = await r.json();
      if (d.ok) {
        toast('Logo güncellendi', 'success');
        if (tip === 'site') {
          const prev = document.getElementById('siteLogoPreview');
          prev.src = data; prev.style.display = 'block';
          document.getElementById('siteLogoYok').style.display = 'none';
        } else {
          const prev = document.getElementById('adminLogoPreview');
          prev.src = data; prev.style.display = 'block';
          document.getElementById('adminLogoYok').style.display = 'none';
          const img = document.getElementById('adminLogoImg');
          if (img) { img.src = data; img.style.display = 'block'; }
        }
      } else toast(d.hata || 'Hata', 'error');
    } catch (ex) { toast('Bağlantı hatası', 'error'); }
  };
  reader.readAsDataURL(file);
}

async function logoSil(tip) {
  try {
    const r = await fetch('/api/admin/logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tip, data: '' })
    });
    const d = await r.json();
    if (d.ok) {
      toast('Logo silindi', 'success');
      if (tip === 'site') {
        document.getElementById('siteLogoPreview').style.display = 'none';
        document.getElementById('siteLogoYok').style.display = 'block';
      } else {
        document.getElementById('adminLogoPreview').style.display = 'none';
        document.getElementById('adminLogoYok').style.display = 'block';
        const img = document.getElementById('adminLogoImg');
        if (img) img.style.display = 'none';
      }
    }
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

async function siteBasligiKaydet() {
  const baslik = document.getElementById('siteBaslikInput')?.value?.trim();
  if (!baslik) { toast('Başlık boş olamaz', 'error'); return; }
  try {
    const r = await fetch('/api/admin/site-basligi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baslik })
    });
    const d = await r.json();
    if (d.ok) toast('Başlık güncellendi', 'success');
    else toast(d.hata || 'Hata', 'error');
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

async function sifreSistemiGuncelle(aktif) {
  try {
    const r = await fetch('/api/admin/sifre-sistemi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif })
    });
    const d = await r.json();
    if (d.ok) {
      document.getElementById('sifreSistemiDurum').textContent = aktif ? 'Aktif' : 'Kapalı';
      toast('Şifre sistemi ' + (aktif ? 'aktif edildi' : 'kapatıldı'), 'success');
    }
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

async function sifreDegistir() {
  const mevcut = document.getElementById('mevcutSifre')?.value;
  const yeni = document.getElementById('yeniSifre')?.value;
  if (!mevcut || !yeni) { toast('Tüm alanları doldurun', 'error'); return; }
  if (yeni.length < 4) { toast('Yeni şifre en az 4 karakter olmalı', 'error'); return; }
  try {
    const r = await fetch('/api/admin/sifre-degistir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mevcut_sifre: mevcut, yeni_sifre: yeni })
    });
    const d = await r.json();
    if (d.ok) {
      toast('Şifre değiştirildi', 'success');
      document.getElementById('mevcutSifre').value = '';
      document.getElementById('yeniSifre').value = '';
    } else toast(d.hata || 'Hata', 'error');
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function modalGoster(icerik) {
  const container = document.getElementById('modalContainer');
  container.innerHTML = `
    <div class="modal-overlay" id="aktifModal" onclick="modalDisiTikla(event)">
      <div class="modal-box">${icerik}</div>
    </div>
  `;
}

function modalDisiTikla(e) {
  if (e.target.id === 'aktifModal') modalKapat();
}

function modalKapat() {
  const container = document.getElementById('modalContainer');
  container.innerHTML = '';
  yuklenenVideoData = null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') modalKapat();
});

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tarihFormat(tarih) {
  if (!tarih) return '-';
  try {
    const d = new Date(tarih);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return tarih; }
}

function toast(msg, tip = 'info', sure = 3500) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${tip}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), sure);
}

// ─── İÇDER'DEN AKTAR ─────────────────────────────────────────────────────────
function topluVeAktarOrgDoldur() {
  ['aktarOrgInput', 'topluOrgInput'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">Organizasyon seçin</option>';
    organizasyonlar.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.ad} (${o.yil})`;
      sel.appendChild(opt);
    });
  });
}

// Eski fonksiyon adı uyumluluğu için
function aktarOrgListesiDoldur() { topluVeAktarOrgDoldur(); }

// ─── İÇDER ORGANİZASYONLARI YÜKLE ──────────────────────────────────────────
async function icderOrglariYukle() {
  const sel = document.getElementById('icderOrgInput');
  const durum = document.getElementById('icderOrgDurum');
  if (!sel) return;
  sel.innerHTML = '<option value="">Yükleniyor...</option>';
  if (durum) durum.textContent = '';
  try {
    const r = await fetch('/api/admin/icder-organizasyonlar');
    const d = await r.json();
    sel.innerHTML = '<option value="">Tüm organizasyonlar (hepsi)</option>';
    if (d.mesaj) {
      if (durum) durum.textContent = '⚠️ ' + d.mesaj;
      sel.innerHTML = '<option value="">Bulunamadı</option>';
      return;
    }
    if (!d.organizasyonlar || d.organizasyonlar.length === 0) {
      if (durum) durum.textContent = 'İÇDER\'de organizasyon bulunamadı';
      return;
    }
    d.organizasyonlar.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.ad} (${o.yil}) — ${o.bagisci_sayisi} bağışçı`;
      sel.appendChild(opt);
    });
    if (durum) durum.textContent = `✅ ${d.organizasyonlar.length} organizasyon bulundu`;
  } catch (e) {
    sel.innerHTML = '<option value="">Bağlantı hatası</option>';
    if (durum) durum.textContent = '❌ ' + e.message;
  }
}

async function icderdenAktar() {
  const icderOrgId = document.getElementById('icderOrgInput')?.value || '';
  const orgId = document.getElementById('aktarOrgInput')?.value;
  const uzerineYaz = document.getElementById('uzerineYazToggle')?.checked || false;
  const sonuc = document.getElementById('aktarSonuc');
  if (!orgId) { toast('Hedef organizasyon seçin', 'error'); return; }
  sonuc.textContent = 'Aktarılıyor...';
  sonuc.style.color = 'var(--text3)';
  try {
    const r = await fetch('/api/admin/icder-aktar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizasyon_id: orgId, icder_org_id: icderOrgId || null, uzerine_yaz: uzerineYaz })
    });
    const d = await r.json();
    if (d.ok) {
      sonuc.style.color = 'var(--accent)';
      sonuc.textContent = '✅ ' + d.mesaj;
      toast(d.mesaj, 'success', 5000);
      bagiscilarYukle();
      dashboardYukle();
    } else {
      sonuc.style.color = 'var(--red)';
      sonuc.textContent = '❌ ' + (d.hata || 'Hata');
      toast(d.hata || 'Aktarma hatası', 'error');
    }
  } catch (e) {
    sonuc.style.color = 'var(--red)';
    sonuc.textContent = '❌ Bağlantı hatası';
    toast('Bağlantı hatası', 'error');
  }
}

// ─── TOPLU BAĞIŞÇI EKLE ───────────────────────────────────────────────────────
async function topluBagisciEkle() {
  const orgId = document.getElementById('topluOrgInput')?.value;
  const metin = document.getElementById('topluListeInput')?.value?.trim();
  const sonuc = document.getElementById('topluSonuc');
  if (!orgId) { toast('Organizasyon seçin', 'error'); return; }
  if (!metin) { toast('Liste boş', 'error'); return; }

  const satirlar = metin.split('\n').map(s => s.trim()).filter(Boolean);
  const liste = satirlar.map(satir => {
    const parcalar = satir.split('|').map(s => s.trim());
    return { ad: parcalar[0], telefon: parcalar[1] || '' };
  }).filter(x => x.ad);

  if (liste.length === 0) { toast('Geçerli isim bulunamadı', 'error'); return; }

  sonuc.textContent = `${liste.length} kayıt gönderiliyor...`;
  try {
    const r = await fetch('/api/admin/bagiscilar/toplu-ekle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizasyon_id: orgId, liste })
    });
    const d = await r.json();
    if (d.ok) {
      sonuc.textContent = `✅ ${d.eklenen} bağışçı eklendi`;
      document.getElementById('topluListeInput').value = '';
      toast(`${d.eklenen} bağışçı eklendi`, 'success');
      bagiscilarYukle();
    } else {
      sonuc.textContent = '❌ ' + (d.hata || 'Hata');
      toast(d.hata || 'Hata', 'error');
    }
  } catch (e) {
    sonuc.textContent = '❌ Bağlantı hatası';
    toast('Bağlantı hatası', 'error');
  }
}

// ─── VİDEO LİNK KOPYALA ──────────────────────────────────────────────────────
function videoLinkKopyala(videoId) {
  const link = `${window.location.origin}/video/${videoId}`;
  navigator.clipboard.writeText(link).then(() => {
    toast('Link kopyalandı: ' + link, 'success', 4000);
  }).catch(() => {
    // Fallback
    const inp = document.createElement('input');
    inp.value = link;
    document.body.appendChild(inp);
    inp.select();
    document.execCommand('copy');
    document.body.removeChild(inp);
    toast('Link kopyalandı', 'success');
  });
}
