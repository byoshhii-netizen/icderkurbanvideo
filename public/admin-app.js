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
    if (d.isimle_arama_aktif !== undefined) {
      const tog = document.getElementById('isimleAramaToggle');
      if (tog) {
        tog.checked = d.isimle_arama_aktif === '1';
        const durum = document.getElementById('isimleAramaDurum');
        if (durum) durum.textContent = tog.checked ? 'Açık (isim + tel + etiket)' : 'Kapalı (sadece tel/etiket)';
        _isimAramaUiGuncelle(tog.checked);
      }
    }
    if (d.varsayilan_video_basligi !== undefined) {
      const inp = document.getElementById('varsayilanVideoBaslikInput');
      if (inp) inp.value = d.varsayilan_video_basligi || '';
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

// ─── KURBAN + 7 HİSSE EKLE (icderrr tarzı) ───────────────────────────────────
let kurbanVideoData = null; // seçilen video dosyası
let _aktifGrupIdler = []; // grup düzenleme için aktif ID listesi

function kurbanEkleModal() {
  kurbanVideoData = null;
  const orgOptions = organizasyonlar.map(o =>
    `<option value="${o.id}">${escHtml(o.ad)} (${o.yil})</option>`
  ).join('');

  const hisseSatirlari = Array.from({length: 7}, (_, i) => `
    <div style="border:1px solid var(--border); border-radius:8px; padding:12px; background:var(--bg3);">
      <div style="font-size:0.8rem; font-weight:700; color:var(--accent); margin-bottom:8px;">
        <i class="fas fa-user"></i> ${i+1}. Hisse
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.75rem;">Ad Soyad</label>
          <input type="text" class="form-input" id="hisse${i+1}Ad" placeholder="Bağışçı adı">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.75rem;">Telefon</label>
          <input type="tel" class="form-input" id="hisse${i+1}Tel" placeholder="5XX XXX XX XX">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:0.75rem;">Etiket / Sıra No <small style="color:var(--text3)">(arama için)</small></label>
          <input type="text" class="form-input" id="hisse${i+1}Etiket" placeholder="TC, sıra no, vb.">
        </div>
      </div>
    </div>
  `).join('');

  modalGoster(`
    <div class="modal-header">
      <div class="modal-title"><i class="fas fa-plus-circle" style="color:var(--accent)"></i> Kurban + 7 Hisse Ekle</div>
      <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:20px; max-height:85vh; overflow-y:auto;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Organizasyon *</label>
          <select class="form-select" id="kurbanOrgInput">${orgOptions}</select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Küpe / Sıra No <small style="color:var(--text3)">(opsiyonel)</small></label>
          <input type="text" class="form-input" id="kurbanKupeInput" placeholder="örn: K-001">
        </div>
      </div>

      <div style="font-size:0.85rem; font-weight:600; color:var(--text2); margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <i class="fas fa-users" style="color:var(--accent)"></i> 7 Hisse — Bağışçı Bilgileri
        <small style="font-weight:400; color:var(--text3); margin-left:8px;">Boş bırakılan hisseler açık kalır</small>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        ${hisseSatirlari}
      </div>

      <!-- VİDEO YÜKLEME BÖLÜMÜ -->
      <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border);">
        <div style="font-size:0.85rem; font-weight:600; color:var(--text2); margin-bottom:10px;">
          <i class="fas fa-video" style="color:var(--accent)"></i> Video Yükle
          <small style="font-weight:400; color:var(--text3); margin-left:8px;">Tüm hissedarlara otomatik eklenir — opsiyonel</small>
        </div>
        <div class="upload-area" id="kurbanUploadArea"
          onclick="document.getElementById('kurbanVideoInput').click()"
          ondragover="kurbanDragOver(event)"
          ondrop="kurbanDropVideo(event)"
          style="padding:16px; text-align:center; cursor:pointer;">
          <i class="fas fa-cloud-upload-alt" style="font-size:1.5rem; color:var(--text3);"></i>
          <p style="margin:6px 0 2px; color:var(--text3); font-size:0.85rem;">Video seçmek için tıklayın veya sürükleyin</p>
          <small style="color:var(--text3);">MP4, MOV, WebM — Maks 500MB</small>
        </div>
        <input type="file" id="kurbanVideoInput" accept="video/*" style="display:none" onchange="kurbanVideoSecildi(this)">
        <div class="upload-progress" id="kurbanUploadProgress" style="display:none; margin-top:8px;">
          <div class="upload-progress-bar" id="kurbanUploadProgressBar" style="width:0%"></div>
        </div>
        <div id="kurbanUploadStatus" style="font-size:0.82rem; color:var(--text3); margin-top:6px;"></div>
      </div>

      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:20px; padding-top:16px; border-top:1px solid var(--border);">
        <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
        <button class="btn btn-primary" id="kurbanKaydetBtn" onclick="kurbanKaydet()">
          <i class="fas fa-save"></i> Kaydet
        </button>
      </div>
    </div>
  `);
}

function kurbanDragOver(e) {
  e.preventDefault();
  document.getElementById('kurbanUploadArea').classList.add('drag-over');
}

function kurbanDropVideo(e) {
  e.preventDefault();
  document.getElementById('kurbanUploadArea').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) kurbanVideoSecildiDosya(file);
}

function kurbanVideoSecildi(input) {
  if (input.files[0]) kurbanVideoSecildiDosya(input.files[0]);
}

function kurbanVideoSecildiDosya(file) {
  if (!file.type.startsWith('video/')) { toast('Sadece video dosyası yükleyebilirsiniz', 'error'); return; }
  if (file.size > 500 * 1024 * 1024) { toast('Dosya 500MB\'dan büyük olamaz', 'error'); return; }
  kurbanVideoData = file;
  const area = document.getElementById('kurbanUploadArea');
  area.innerHTML = `<i class="fas fa-file-video" style="color:var(--accent); font-size:1.3rem;"></i>
    <p style="margin:6px 0 2px; color:var(--accent); font-size:0.85rem;">${escHtml(file.name)}</p>
    <small style="color:var(--text3);">${(file.size/1024/1024).toFixed(1)} MB — Kaydet butonuna basın</small>`;
}

async function kurbanKaydet() {
  const orgId = document.getElementById('kurbanOrgInput')?.value;
  const kupe = document.getElementById('kurbanKupeInput')?.value?.trim();
  if (!orgId) { toast('Organizasyon seçin', 'error'); return; }

  // Hisseleri topla
  const hisseler = [];
  for (let i = 1; i <= 7; i++) {
    hisseler.push({
      ad: document.getElementById(`hisse${i}Ad`)?.value?.trim() || '',
      telefon: document.getElementById(`hisse${i}Tel`)?.value?.trim() || '',
      etiket: document.getElementById(`hisse${i}Etiket`)?.value?.trim() || '',
    });
  }

  const doluHisseler = hisseler.filter(h => h.ad);
  if (doluHisseler.length === 0) { toast('En az 1 hisse doldurulmalı', 'error'); return; }

  const btn = document.getElementById('kurbanKaydetBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kaydediliyor...';

  const grupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    // 1. Bağışçıları kaydet
    let eklenen = 0;
    const eklenenIdler = [];
    for (let i = 0; i < 7; i++) {
      const h = hisseler[i];
      if (!h.ad) continue;
      const r = await fetch('/api/admin/bagiscilar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad: h.ad,
          telefon: h.telefon || null,
          organizasyon_id: orgId,
          hisse_no: i + 1,
          etiket1: h.etiket || null,
          etiket2: kupe || null,
          grup_id: grupId,
        })
      });
      const d = await r.json();
      if (d.ok) { eklenen++; eklenenIdler.push(d.id); }
    }

    if (eklenen === 0) { toast('Bağışçı eklenemedi', 'error'); return; }

    // 2. Video varsa yükle
    if (kurbanVideoData) {
      const status = document.getElementById('kurbanUploadStatus');
      const prog = document.getElementById('kurbanUploadProgress');
      const progBar = document.getElementById('kurbanUploadProgressBar');

      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Video yükleniyor...';
      if (prog) prog.style.display = 'block';

      const formData = new FormData();
      formData.append('video', kurbanVideoData);

      const uploadResult = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round(e.loaded / e.total * 100);
            if (progBar) progBar.style.width = pct + '%';
            if (status) status.textContent = `Yükleniyor... %${pct}`;
          }
        };
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (_) { reject(new Error('Yanıt parse hatası')); }
        };
        xhr.onerror = () => reject(new Error('Ağ hatası'));
        xhr.open('POST', '/api/medya/upload');
        xhr.send(formData);
      });

      if (uploadResult.hata) throw new Error(uploadResult.hata);
      if (status) status.textContent = 'Video yüklendi, kaydediliyor...';
      if (progBar) progBar.style.width = '100%';

      // Başlık ve etiket backend'de otomatik atanır (varsayılan başlık + bağışçı etiketleri)
      const videoR = await fetch('/api/admin/videolar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bagisci_id: eklenenIdler[0],
          organizasyon_id: orgId,
          cloudinary_url: uploadResult.url,
          cloudinary_public_id: uploadResult.public_id,
          thumbnail_url: uploadResult.thumbnail_url || null,
          sure: uploadResult.duration || 0,
          boyut: uploadResult.bytes || 0,
        })
      });
      const videoD = await videoR.json();
      if (!videoD.ok) throw new Error(videoD.hata || 'Video kayıt hatası');

      toast(
        `${eklenen} bağışçı eklendi + video ${videoD.grup_sayisi > 1 ? videoD.grup_sayisi + ' hissedara' : ''} yüklendi`,
        'success', 5000
      );
    } else {
      toast(`${eklenen} bağışçı eklendi — grup oluşturuldu (${doluHisseler.length}/7 hisse)`, 'success');
    }

    kurbanVideoData = null;
    modalKapat();
    bagiscilarYukle();
    videolarYukle();
  } catch (e) {
    toast('Hata: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Kaydet';
  }
}

// ─── BAĞIŞÇILAR ───────────────────────────────────────────────────────────────
async function bagiscilarYukle() {
  const orgId = document.getElementById('bagisciOrgFilter')?.value || '';
  const videoDurum = document.getElementById('bagisciVideoDurum')?.value || '';
  const q = document.getElementById('bagisciArama')?.value?.trim() || '';
  const grupTur = document.getElementById('bagisciGrupTur')?.value || ''; // 'tumu' | 'gruplu' | 'tekil'
  const tbody = document.getElementById('bagisciTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;"><div class="spinner" style="margin:auto;"></div></td></tr>';
  try {
    const params = new URLSearchParams();
    if (orgId) params.set('org_id', orgId);
    if (videoDurum) params.set('video_durum', videoDurum);
    if (q) params.set('q', q);
    const r = await fetch('/api/admin/bagiscilar?' + params.toString());
    let bagiscilar = await r.json();
    tbody.innerHTML = '';

    // Grup türü filtresi (frontend'de)
    if (grupTur === 'gruplu') {
      bagiscilar = bagiscilar.filter(b => !!b.grup_id);
    } else if (grupTur === 'tekil') {
      bagiscilar = bagiscilar.filter(b => !b.grup_id);
    }

    if (bagiscilar.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text3); padding:24px;">Bağışçı bulunamadı</td></tr>';
      return;
    }

    // Grupları tespit et — grup_id'ye göre sırala, gruplular bir arada gelsin
    const gruplar = {};
    const tekiller = [];
    bagiscilar.forEach(b => {
      if (b.grup_id) {
        if (!gruplar[b.grup_id]) gruplar[b.grup_id] = [];
        gruplar[b.grup_id].push(b);
      } else {
        tekiller.push(b);
      }
    });

    // Önce grupları render et, sonra tekilleri
    let grupSayac = 0;
    const grupRenkleri = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

    Object.values(gruplar).forEach(grup => {
      const renk = grupRenkleri[grupSayac % grupRenkleri.length];
      grupSayac++;
      // Grup başlık satırı
      const baslikTr = document.createElement('tr');
      const grupIdler = grup.map(b => b.id);
      baslikTr.innerHTML = `
        <td colspan="8" style="padding:6px 12px; background:${renk}18; border-left:3px solid ${renk}; border-top:2px solid ${renk}40;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div>
              <span style="font-size:0.78rem; font-weight:700; color:${renk};">
                <i class="fas fa-users"></i> ${grup.length} Hisseli Kurban Grubu
              </span>
              <span style="font-size:0.72rem; color:var(--text3); margin-left:8px;">${grup.filter(b=>b.video_var).length}/${grup.length} video var</span>
            </div>
            <button class="btn btn-danger btn-sm" onclick="grupSil([${grupIdler.join(',')}])" title="Grubu Sil" style="font-size:0.72rem; padding:3px 8px;">
              <i class="fas fa-trash"></i> Grubu Sil
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(baslikTr);

      // Grup üyelerini hisse_no'ya göre sırala
      grup.sort((a, c) => (a.hisse_no || 1) - (c.hisse_no || 1));
      grup.forEach((b, idx) => {
        const isLast = idx === grup.length - 1;
        const tr = document.createElement('tr');
        tr.className = b.video_var ? 'bagisci-row-green' : 'bagisci-row-red';
        tr.style.cssText = `border-left:3px solid ${renk}; ${isLast ? 'border-bottom:2px solid ' + renk + '40;' : ''}`;
        tr.innerHTML = _bagisciSatirHtml(b);
        tbody.appendChild(tr);
      });

      // Grup arası boşluk
      const boslukTr = document.createElement('tr');
      boslukTr.innerHTML = '<td colspan="8" style="padding:4px; background:transparent; border:none;"></td>';
      tbody.appendChild(boslukTr);
    });

    // Tekil bağışçılar
    tekiller.forEach(b => {
      const tr = document.createElement('tr');
      tr.className = b.video_var ? 'bagisci-row-green' : 'bagisci-row-red';
      tr.innerHTML = _bagisciSatirHtml(b);
      tbody.appendChild(tr);
    });

  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--red); padding:24px;">Yükleme hatası</td></tr>';
  }
}

function _bagisciSatirHtml(b) {
  return `
    <td>
      ${b.video_var
        ? '<span class="dot-green"></span><span class="badge badge-green" style="font-size:0.7rem;">Video Var</span>'
        : '<span class="dot-red"></span><span class="badge badge-red" style="font-size:0.7rem;">Video Yok</span>'
      }
    </td>
    <td style="font-weight:600; color:var(--text)">${escHtml(b.ad)}</td>
    <td style="font-family:monospace; font-size:0.85rem;">${escHtml(b.telefon || '-')}</td>
    <td style="text-align:center;">
      <span class="badge badge-gray" style="font-size:0.75rem;">${b.hisse_no || 1}. Hisse</span>
    </td>
    <td style="font-size:0.75rem; color:var(--text3);">
      ${[b.etiket1,b.etiket2,b.etiket3,b.etiket4].filter(Boolean).map(e => `<span style="background:var(--bg4);border-radius:3px;padding:1px 4px;margin:1px;display:inline-block;">${escHtml(e)}</span>`).join('')}
    </td>
    <td style="font-size:0.85rem; color:var(--text3)">${escHtml(b.organizasyon_adi || '')}</td>
    <td>
      ${b.video_sayisi > 0
        ? `<span class="video-count-badge">${b.video_sayisi}</span>`
        : '<span style="color:var(--text3)">0</span>'
      }
      ${b.izlenme_sayisi > 0
        ? `<span class="izlenme-badge" title="${b.izlenme_sayisi} kez izlendi"><i class="fas fa-eye"></i> ${b.izlenme_sayisi}</span>`
        : ''
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
}

function bagisciAramaDebounce() {
  clearTimeout(bagisciAramaTimeout);
  bagisciAramaTimeout = setTimeout(bagiscilarYukle, 400);
}

function bagisciEkleModal() {
  tekilVideoData = null;
  const orgOptions = organizasyonlar.map(o =>
    `<option value="${o.id}">${escHtml(o.ad)} (${o.yil})</option>`
  ).join('');
  modalGoster(`
    <div class="modal-header">
      <div class="modal-title">Tekil Bağışçı Ekle</div>
      <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:20px; max-height:85vh; overflow-y:auto;">
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
      <div class="form-group">
        <label class="form-label">Hisse No <small style="color:var(--text3)">(7'li kurban için 1-7)</small></label>
        <select class="form-select" id="bagisciHisseInput">
          ${[1,2,3,4,5,6,7].map(n => `<option value="${n}">${n}. Hisse</option>`).join('')}
        </select>
      </div>
      <div style="border-top:1px solid var(--border); margin:14px 0; padding-top:14px;">
        <div style="font-size:0.85rem; font-weight:600; color:var(--text2); margin-bottom:10px;">
          <i class="fas fa-tags" style="color:var(--accent)"></i> Arama Etiketleri
          <small style="font-weight:400; color:var(--text3)"> — telefon, TC, sıra no vb.</small>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          ${[1,2,3,4,5,6,7].map(n => `
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.78rem;">Etiket ${n}</label>
              <input type="text" class="form-input" id="bagisciEtiket${n}Input" placeholder="örn: 5321234567">
            </div>
          `).join('')}
        </div>
      </div>

      <!-- VİDEO YÜKLEME -->
      <div style="margin-top:4px; padding-top:14px; border-top:1px solid var(--border);">
        <div style="font-size:0.85rem; font-weight:600; color:var(--text2); margin-bottom:10px;">
          <i class="fas fa-video" style="color:var(--accent)"></i> Video Yükle
          <small style="font-weight:400; color:var(--text3); margin-left:8px;">Opsiyonel — sonradan da eklenebilir</small>
        </div>
        <div class="upload-area" id="tekilUploadArea"
          onclick="document.getElementById('tekilVideoInput').click()"
          ondragover="tekilDragOver(event)" ondrop="tekilDropVideo(event)"
          style="padding:14px; text-align:center; cursor:pointer;">
          <i class="fas fa-cloud-upload-alt" style="font-size:1.4rem; color:var(--text3);"></i>
          <p style="margin:5px 0 2px; color:var(--text3); font-size:0.85rem;">Video seçmek için tıklayın veya sürükleyin</p>
          <small style="color:var(--text3);">MP4, MOV, WebM — Maks 500MB</small>
        </div>
        <input type="file" id="tekilVideoInput" accept="video/*" style="display:none" onchange="tekilVideoSecildi(this)">
        <div class="upload-progress" id="tekilUploadProgress" style="display:none; margin-top:8px;">
          <div class="upload-progress-bar" id="tekilUploadProgressBar" style="width:0%"></div>
        </div>
        <div id="tekilUploadStatus" style="font-size:0.82rem; color:var(--text3); margin-top:6px;"></div>
      </div>

      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
        <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
        <button class="btn btn-primary" id="tekilKaydetBtn" onclick="bagisciKaydet()"><i class="fas fa-save"></i> Kaydet</button>
      </div>
    </div>
  `);
}

let tekilVideoData = null;

function tekilDragOver(e) {
  e.preventDefault();
  document.getElementById('tekilUploadArea').classList.add('drag-over');
}
function tekilDropVideo(e) {
  e.preventDefault();
  document.getElementById('tekilUploadArea').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) tekilVideoSecildiDosya(file);
}
function tekilVideoSecildi(input) {
  if (input.files[0]) tekilVideoSecildiDosya(input.files[0]);
}
function tekilVideoSecildiDosya(file) {
  if (!file.type.startsWith('video/')) { toast('Sadece video dosyası yükleyebilirsiniz', 'error'); return; }
  if (file.size > 500 * 1024 * 1024) { toast('Dosya 500MB\'dan büyük olamaz', 'error'); return; }
  tekilVideoData = file;
  const area = document.getElementById('tekilUploadArea');
  area.innerHTML = `<i class="fas fa-file-video" style="color:var(--accent); font-size:1.3rem;"></i>
    <p style="margin:5px 0 2px; color:var(--accent); font-size:0.85rem;">${escHtml(file.name)}</p>
    <small style="color:var(--text3);">${(file.size/1024/1024).toFixed(1)} MB</small>`;
}

async function bagisciKaydet() {
  const ad = document.getElementById('bagisciAdInput')?.value?.trim();
  const telefon = document.getElementById('bagisciTelInput')?.value?.trim();
  const organizasyon_id = document.getElementById('bagisciOrgInput')?.value;
  const hisse_no = document.getElementById('bagisciHisseInput')?.value || 1;
  const etiketler = {};
  for (let i = 1; i <= 7; i++) {
    etiketler[`etiket${i}`] = document.getElementById(`bagisciEtiket${i}Input`)?.value?.trim() || '';
  }
  if (!ad || !organizasyon_id) { toast('Ad ve organizasyon gerekli', 'error'); return; }

  const btn = document.getElementById('tekilKaydetBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kaydediliyor...'; }

  try {
    // 1. Bağışçıyı kaydet
    const r = await fetch('/api/admin/bagiscilar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad, telefon, organizasyon_id, hisse_no: parseInt(hisse_no), ...etiketler })
    });
    const d = await r.json();
    if (!d.ok) { toast(d.hata || 'Hata', 'error'); return; }

    const bagisciId = d.id;

    // 2. Video varsa yükle
    if (tekilVideoData && bagisciId) {
      const status = document.getElementById('tekilUploadStatus');
      const prog = document.getElementById('tekilUploadProgress');
      const progBar = document.getElementById('tekilUploadProgressBar');
      if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Video yükleniyor...';
      if (prog) prog.style.display = 'block';

      const formData = new FormData();
      formData.append('video', tekilVideoData);

      const uploadResult = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round(e.loaded / e.total * 100);
            if (progBar) progBar.style.width = pct + '%';
            if (status) status.textContent = `Yükleniyor... %${pct}`;
          }
        };
        xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)); } catch (_) { reject(new Error('Parse hatası')); } };
        xhr.onerror = () => reject(new Error('Ağ hatası'));
        xhr.open('POST', '/api/medya/upload');
        xhr.send(formData);
      });

      if (uploadResult.hata) throw new Error(uploadResult.hata);
      if (progBar) progBar.style.width = '100%';
      if (status) status.textContent = 'Kaydediliyor...';

      const videoR = await fetch('/api/admin/videolar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bagisci_id: bagisciId,
          organizasyon_id,
          cloudinary_url: uploadResult.url,
          cloudinary_public_id: uploadResult.public_id,
          thumbnail_url: uploadResult.thumbnail_url || null,
          sure: uploadResult.duration || 0,
          boyut: uploadResult.bytes || 0,
        })
      });
      const videoD = await videoR.json();
      if (!videoD.ok) throw new Error(videoD.hata || 'Video kayıt hatası');

      toast('Bağışçı eklendi + video yüklendi', 'success', 4000);
    } else {
      toast('Bağışçı eklendi', 'success');
    }

    tekilVideoData = null;
    modalKapat();
    bagiscilarYukle();
    videolarYukle();
  } catch (e) {
    toast('Hata: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Kaydet'; }
  }
}

function bagisciDuzenle(id) {
  // Tüm bağışçıları çek, sonra grup varsa tüm grubu getir
  fetch('/api/admin/bagiscilar').then(r => r.json()).then(tumListe => {
    const b = tumListe.find(x => x.id === id);
    if (!b) return;

    // Grup varsa gruptaki tüm üyeleri al, yoksa sadece bu bağışçı
    let grupUyeleri = [];
    if (b.grup_id) {
      grupUyeleri = tumListe
        .filter(x => x.grup_id === b.grup_id && x.organizasyon_id === b.organizasyon_id)
        .sort((a, c) => (a.hisse_no || 1) - (c.hisse_no || 1));
    }

    const orgOptions = organizasyonlar.map(o =>
      `<option value="${o.id}" ${o.id === b.organizasyon_id ? 'selected' : ''}>${escHtml(o.ad)} (${o.yil})</option>`
    ).join('');

    if (grupUyeleri.length > 1) {
      // ─── GRUP DÜZENLEMESİ ───────────────────────────────────────────────────
      _aktifGrupIdler = grupUyeleri.map(u => u.id); // global'e kaydet
      const hisseSatirlari = grupUyeleri.map(u => `
        <div style="border:1px solid var(--border); border-radius:8px; padding:12px; background:var(--bg3);">
          <div style="font-size:0.8rem; font-weight:700; color:var(--accent); margin-bottom:8px;">
            <i class="fas fa-user"></i> ${u.hisse_no || '?'}. Hisse
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Ad Soyad</label>
              <input type="text" class="form-input" id="grupHisse${u.id}Ad" value="${escHtml(u.ad)}">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Telefon</label>
              <input type="tel" class="form-input" id="grupHisse${u.id}Tel" value="${escHtml(u.telefon || '')}">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Etiket 1 <small style="color:var(--text3)">(arama)</small></label>
              <input type="text" class="form-input" id="grupHisse${u.id}Et1" value="${escHtml(u.etiket1 || '')}">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Etiket 2</label>
              <input type="text" class="form-input" id="grupHisse${u.id}Et2" value="${escHtml(u.etiket2 || '')}">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Etiket 3</label>
              <input type="text" class="form-input" id="grupHisse${u.id}Et3" value="${escHtml(u.etiket3 || '')}">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Etiket 4</label>
              <input type="text" class="form-input" id="grupHisse${u.id}Et4" value="${escHtml(u.etiket4 || '')}">
            </div>
          </div>
        </div>
      `).join('');

      modalGoster(`
        <div class="modal-header">
          <div class="modal-title"><i class="fas fa-users" style="color:var(--accent)"></i> Grup Düzenle — ${grupUyeleri.length} Hisse</div>
          <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="padding:20px; max-height:85vh; overflow-y:auto;">
          <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Organizasyon *</label>
            <select class="form-select" id="grupOrgInput">${orgOptions}</select>
          </div>
          <div style="font-size:0.85rem; font-weight:600; color:var(--text2); margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
            <i class="fas fa-users" style="color:var(--accent)"></i> Hisse Bilgileri
          </div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${hisseSatirlari}
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:20px; padding-top:16px; border-top:1px solid var(--border);">
            <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
            <button class="btn btn-primary" id="grupGuncelleBtn" onclick="grupGuncelle(_aktifGrupIdler)">
              <i class="fas fa-save"></i> Tümünü Güncelle
            </button>
          </div>
        </div>
      `);
    } else {
      // ─── TEKİL BAĞIŞÇI DÜZENLEMESİ ─────────────────────────────────────────
      const hisseOptions = [1,2,3,4,5,6,7].map(n =>
        `<option value="${n}" ${(b.hisse_no || 1) == n ? 'selected' : ''}>${n}. Hisse</option>`
      ).join('');
      modalGoster(`
        <div class="modal-header">
          <div class="modal-title">Bağışçı Düzenle</div>
          <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="padding:20px; max-height:80vh; overflow-y:auto;">
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
          <div class="form-group">
            <label class="form-label">Hisse No</label>
            <select class="form-select" id="bagisciHisseInput">${hisseOptions}</select>
          </div>
          <div style="border-top:1px solid var(--border); margin:14px 0; padding-top:14px;">
            <div style="font-size:0.85rem; font-weight:600; color:var(--text2); margin-bottom:10px;">
              <i class="fas fa-tags" style="color:var(--accent)"></i> Arama Etiketleri
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              ${[1,2,3,4,5,6,7].map(n => `
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label" style="font-size:0.78rem;">Etiket ${n}</label>
                  <input type="text" class="form-input" id="bagisciEtiket${n}Input" value="${escHtml(b['etiket'+n] || '')}" placeholder="örn: 5321234567">
                </div>
              `).join('')}
            </div>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
            <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
            <button class="btn btn-primary" onclick="bagisciGuncelle(${id})"><i class="fas fa-save"></i> Güncelle</button>
          </div>
        </div>
      `);
    }
  });
}

async function grupSil(idler) {
  if (!confirm(`Bu gruptaki ${idler.length} bağışçı ve tüm videoları silinecek. Emin misiniz?`)) return;
  try {
    let silinen = 0;
    for (const id of idler) {
      const r = await fetch('/api/admin/bagiscilar/' + id, { method: 'DELETE' });
      const d = await r.json();
      if (d.ok) silinen++;
    }
    toast(`${silinen} bağışçı silindi`, 'success');
    bagiscilarYukle();
    videolarYukle();
  } catch (e) { toast('Hata: ' + e.message, 'error'); }
}

async function grupGuncelle(idler) {
  const orgId = document.getElementById('grupOrgInput')?.value;
  if (!orgId) { toast('Organizasyon seçin', 'error'); return; }

  const btn = document.getElementById('grupGuncelleBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kaydediliyor...'; }

  try {
    let guncellenen = 0;
    for (const id of idler) {
      const ad = document.getElementById(`grupHisse${id}Ad`)?.value?.trim();
      const telefon = document.getElementById(`grupHisse${id}Tel`)?.value?.trim();
      const etiket1 = document.getElementById(`grupHisse${id}Et1`)?.value?.trim() || '';
      const etiket2 = document.getElementById(`grupHisse${id}Et2`)?.value?.trim() || '';
      const etiket3 = document.getElementById(`grupHisse${id}Et3`)?.value?.trim() || '';
      const etiket4 = document.getElementById(`grupHisse${id}Et4`)?.value?.trim() || '';
      if (!ad) continue;
      const r = await fetch('/api/admin/bagiscilar/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad, telefon, organizasyon_id: orgId, etiket1, etiket2, etiket3, etiket4 })
      });
      const d = await r.json();
      if (d.ok) guncellenen++;
    }
    toast(`${guncellenen} hisse güncellendi`, 'success');
    modalKapat();
    bagiscilarYukle();
  } catch (e) {
    toast('Hata: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Tümünü Güncelle'; }
  }
}

async function bagisciGuncelle(id) {
  const ad = document.getElementById('bagisciAdInput')?.value?.trim();
  const telefon = document.getElementById('bagisciTelInput')?.value?.trim();
  const organizasyon_id = document.getElementById('bagisciOrgInput')?.value;
  const hisse_no = document.getElementById('bagisciHisseInput')?.value || 1;
  const etiketler = {};
  for (let i = 1; i <= 7; i++) {
    etiketler[`etiket${i}`] = document.getElementById(`bagisciEtiket${i}Input`)?.value?.trim() || '';
  }
  if (!ad) { toast('Ad gerekli', 'error'); return; }
  try {
    const r = await fetch('/api/admin/bagiscilar/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad, telefon, organizasyon_id, hisse_no: parseInt(hisse_no), ...etiketler })
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
        <td style="font-weight:600; color:var(--text)">
          ${escHtml(v.bagisci_adi)}
          ${v.hisse_no ? `<div style="font-size:0.72rem; color:var(--text3); margin-top:2px;">${v.hisse_no}. Hisse</div>` : ''}
          ${v.grup_uyeleri && v.grup_uyeleri.length > 1 ? `
            <div style="margin-top:5px; display:flex; flex-wrap:wrap; gap:3px;">
              ${v.grup_uyeleri.map(u => `
                <span style="font-size:0.68rem; background:var(--bg4); border:1px solid var(--border); border-radius:4px; padding:1px 5px; color:var(--text2);">
                  ${escHtml(u.hisse_no + '. ')}${escHtml(u.ad)}
                </span>
              `).join('')}
            </div>
          ` : ''}
        </td>
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
      <div class="modal-title"><i class="fas fa-video" style="color:var(--accent)"></i> Video Ekle</div>
      <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:20px; max-height:85vh; overflow-y:auto;">

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:4px;">
        <div class="form-group">
          <label class="form-label">Organizasyon *</label>
          <select class="form-select" id="videoOrgInput" onchange="videoBagisciListeYukle()">${orgOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Bağışçı / Hisse *</label>
          <select class="form-select" id="videoBagisciInput" onchange="videoBagisciSecildi()">
            <option value="">Yükleniyor...</option>
          </select>
        </div>
      </div>

      <!-- Seçilen bağışçı bilgisi -->
      <div id="seciliBagisciInfo" style="display:none; background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:0.85rem;">
        <span id="seciliBagisciAd" style="font-weight:600; color:var(--accent);"></span>
        <span id="seciliBagisciTel" style="color:var(--text3); margin-left:8px;"></span>
        <span id="seciliBagisciHisse" style="color:var(--text3); margin-left:8px;"></span>
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

  videoBagisciListeYukle().then(() => {
    if (bagisciIdOnceden) {
      const sel = document.getElementById('videoBagisciInput');
      if (sel) { sel.value = bagisciIdOnceden; videoBagisciSecildi(); }
    }
  });
}

// Bağışçı listesini organizasyona göre yükle — hisse no ile birlikte
async function videoBagisciListeYukle() {
  const orgId = document.getElementById('videoOrgInput')?.value;
  const sel = document.getElementById('videoBagisciInput');
  if (!sel) return;
  sel.innerHTML = '<option value="">Yükleniyor...</option>';
  try {
    const r = await fetch('/api/admin/bagiscilar?org_id=' + (orgId || ''));
    const liste = await r.json();
    sel.innerHTML = '<option value="">Bağışçı seçin</option>';

    // Hisse no'ya göre grupla
    const gruplar = {};
    liste.forEach(b => {
      const hisse = b.hisse_no || 1;
      if (!gruplar[hisse]) gruplar[hisse] = [];
      gruplar[hisse].push(b);
    });

    const hisseNoList = Object.keys(gruplar).sort((a, b) => Number(a) - Number(b));

    const ekleOpt = (b, parent) => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.dataset.ad = b.ad;
      opt.dataset.tel = b.telefon || '';
      opt.dataset.hisse = b.hisse_no || 1;
      opt.dataset.grupId = b.grup_id || '';
      // Etiketleri birleştir
      const etiketler = [b.etiket1,b.etiket2,b.etiket3,b.etiket4,b.etiket5,b.etiket6,b.etiket7]
        .filter(Boolean).join(', ');
      opt.dataset.etiketler = etiketler;
      opt.textContent = `${b.hisse_no || 1}. Hisse — ${b.ad}` + (b.telefon ? ` (${b.telefon})` : '') + (b.grup_id ? ' 🔗' : '');
      parent.appendChild(opt);
    };

    if (hisseNoList.length > 1) {
      hisseNoList.forEach(hisseNo => {
        const grp = document.createElement('optgroup');
        grp.label = `${hisseNo}. Hisse`;
        gruplar[hisseNo].forEach(b => ekleOpt(b, grp));
        sel.appendChild(grp);
      });
    } else {
      liste.forEach(b => ekleOpt(b, sel));
    }
  } catch (e) {
    sel.innerHTML = '<option value="">Yükleme hatası</option>';
  }
}

// Bağışçı seçilince bilgi göster + etiket alanını otomatik doldur
function videoBagisciSecildi() {
  const sel = document.getElementById('videoBagisciInput');
  const info = document.getElementById('seciliBagisciInfo');
  if (!sel || !info) return;
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { info.style.display = 'none'; return; }

  document.getElementById('seciliBagisciAd').textContent = opt.dataset.ad || opt.textContent;
  document.getElementById('seciliBagisciTel').textContent = opt.dataset.tel ? `📞 ${opt.dataset.tel}` : '';
  document.getElementById('seciliBagisciHisse').textContent = opt.dataset.hisse ? `• ${opt.dataset.hisse}. Hisse` : '';
  if (opt.dataset.grupId) {
    document.getElementById('seciliBagisciHisse').textContent += ' 🔗 Grup — video tüm hissedarlara eklenecek';
  }
  info.style.display = 'block';

  // Etiket alanını otomatik doldur (boşsa)
  const etiketInput = document.getElementById('videoEtiketInput');
  if (etiketInput && !etiketInput.value.trim() && opt.dataset.etiketler) {
    etiketInput.value = opt.dataset.etiketler;
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

    // DB'ye kaydet — başlık ve etiket backend'de otomatik atanır
    const r = await fetch('/api/admin/videolar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bagisci_id: bagisciId,
        organizasyon_id: orgId,
        cloudinary_url: uploadResult.url,
        cloudinary_public_id: uploadResult.public_id,
        thumbnail_url: uploadResult.thumbnail_url || null,
        sure: uploadResult.duration || 0,
        boyut: uploadResult.bytes || 0,
      })
    });
    const d = await r.json();
    if (d.ok) {
      const mesaj = d.grup_sayisi > 1
        ? `Video eklendi — ${d.grup_sayisi} hissedar grubuna yayıldı`
        : 'Video başarıyla eklendi!';
      toast(mesaj, 'success');
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
    const thumbHtml = v.thumbnail_url
      ? `<img src="${escHtml(v.thumbnail_url)}" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;border:1px solid var(--border);margin-bottom:12px;" onerror="this.style.display='none'">`
      : '';
    modalGoster(`
      <div class="modal-header">
        <div class="modal-title">Video Düzenle</div>
        <button class="modal-close" onclick="modalKapat()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="padding:20px;">
        ${thumbHtml}
        <div class="form-group">
          <label class="form-label">Başlık</label>
          <input type="text" class="form-input" id="videoBaslikInput" value="${escHtml(v.baslik || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Arama Etiketleri <small style="color:var(--text3)">(virgülle ayırın)</small></label>
          <input type="text" class="form-input" id="videoEtiketInput" value="${escHtml(v.arama_etiketleri || '')}" placeholder="ahmet, yılmaz, büyükbaş">
        </div>

        <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px;">
          <div style="font-size:0.85rem;font-weight:600;color:var(--text2);margin-bottom:10px;">
            <i class="fas fa-video" style="color:var(--accent)"></i> Video Dosyasını Değiştir
          </div>
          <div class="upload-area" id="uploadArea" onclick="document.getElementById('videoFileInputDuzenle').click()"
            ondragover="dragOver(event)" ondrop="dropVideoDuzenle(event, ${id}, '${escHtml(v.cloudinary_public_id || '')}')">
            <i class="fas fa-cloud-upload-alt"></i>
            <p>Yeni video yüklemek için tıklayın veya sürükleyin</p>
            <small>MP4, MOV, WebM — Maks 500MB</small>
          </div>
          <input type="file" id="videoFileInputDuzenle" accept="video/*" style="display:none"
            onchange="videoSecildiDuzenle(this, ${id}, '${escHtml(v.cloudinary_public_id || '')}')">
          <div class="upload-progress" id="uploadProgress" style="display:none">
            <div class="upload-progress-bar" id="uploadProgressBar" style="width:0%"></div>
          </div>
          <div id="uploadStatusDuzenle" style="font-size:0.85rem;color:var(--text3);margin-top:8px;"></div>
        </div>

        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
          <button class="btn btn-ghost" onclick="modalKapat()">İptal</button>
          <button class="btn btn-primary" onclick="videoGuncelle(${id})"><i class="fas fa-save"></i> Bilgileri Kaydet</button>
        </div>
      </div>
    `);
  });
}

function dropVideoDuzenle(e, id, eskiPublicId) {
  e.preventDefault();
  document.getElementById('uploadArea').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) videoSecildiDosyaDuzenle(file, id, eskiPublicId);
}

function videoSecildiDuzenle(input, id, eskiPublicId) {
  if (input.files[0]) videoSecildiDosyaDuzenle(input.files[0], id, eskiPublicId);
}

async function videoSecildiDosyaDuzenle(file, id, eskiPublicId) {
  const status = document.getElementById('uploadStatusDuzenle');
  const area = document.getElementById('uploadArea');
  const prog = document.getElementById('uploadProgress');
  const progBar = document.getElementById('uploadProgressBar');

  if (!file.type.startsWith('video/')) { toast('Sadece video dosyası yükleyebilirsiniz', 'error'); return; }
  if (file.size > 500 * 1024 * 1024) { toast('Dosya 500MB\'dan büyük olamaz', 'error'); return; }

  area.innerHTML = `<i class="fas fa-spinner fa-spin" style="color:var(--accent)"></i><p style="color:var(--accent)">Yükleniyor: ${escHtml(file.name)}</p>`;
  if (prog) prog.style.display = 'block';
  if (progBar) progBar.style.width = '20%';
  if (status) status.textContent = 'Cloudinary\'ye yükleniyor...';

  try {
    const formData = new FormData();
    formData.append('video', file);
    if (eskiPublicId) formData.append('eski_public_id', eskiPublicId);

    if (progBar) progBar.style.width = '50%';

    const r = await fetch('/api/admin/videolar/' + id + '/video-degistir', {
      method: 'POST',
      body: formData
    });

    if (progBar) progBar.style.width = '90%';
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.hata || 'Yükleme hatası');

    if (progBar) progBar.style.width = '100%';
    if (status) status.innerHTML = '<span style="color:var(--accent)"><i class="fas fa-check-circle"></i> Video değiştirildi!</span>';
    area.innerHTML = `<i class="fas fa-check-circle" style="color:var(--accent)"></i><p style="color:var(--accent)">Yüklendi: ${escHtml(file.name)}</p>`;

    toast('Video başarıyla değiştirildi', 'success');
    setTimeout(() => { modalKapat(); videolarYukle(); }, 1200);
  } catch(e) {
    if (status) status.innerHTML = `<span style="color:var(--red)"><i class="fas fa-times-circle"></i> ${escHtml(e.message)}</span>`;
    area.innerHTML = `<i class="fas fa-cloud-upload-alt"></i><p>Tekrar deneyin</p><small>MP4, MOV, WebM — Maks 500MB</small>`;
    toast('Hata: ' + e.message, 'error');
  }
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

async function varsayilanVideoBasligiKaydet() {
  const baslik = document.getElementById('varsayilanVideoBaslikInput')?.value?.trim();
  if (!baslik) { toast('Başlık boş olamaz', 'error'); return; }
  try {
    const r = await fetch('/api/admin/varsayilan-video-basligi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baslik })
    });
    const d = await r.json();
    if (d.ok) toast('Varsayılan video başlığı güncellendi', 'success');
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

async function isimleAramaGuncelle(aktif) {
  try {
    const r = await fetch('/api/admin/isimle-arama', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif })
    });
    const d = await r.json();
    if (d.ok) {
      const durum = document.getElementById('isimleAramaDurum');
      if (durum) durum.textContent = aktif ? 'Açık (isim + tel + etiket)' : 'Kapalı (sadece tel/etiket)';
      // Etiket/isim alanlarını aktif/deaktif et
      _isimAramaUiGuncelle(aktif);
      toast('İsimle arama ' + (aktif ? 'açıldı' : 'kapatıldı'), 'success');
    } else {
      toast(d.hata || 'Hata', 'error');
    }
  } catch (e) { toast('Bağlantı hatası', 'error'); }
}

function _isimAramaUiGuncelle(aktif) {
  // Ayarlar sayfasında isimle arama kapalıyken bilgi notu göster
  const bilgi = document.getElementById('isimAramaBilgi');
  if (bilgi) {
    bilgi.style.display = aktif ? 'none' : 'block';
  }
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
