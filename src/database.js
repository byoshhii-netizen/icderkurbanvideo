const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// ─── VERİ DİZİNİ ─────────────────────────────────────────────────────────────
function getDataDir() {
  if (process.env.DATA_DIR) {
    console.log('[DB] DATA_DIR env:', process.env.DATA_DIR);
    return process.env.DATA_DIR;
  }
  try {
    if (fs.existsSync('/data')) {
      fs.accessSync('/data', fs.constants.W_OK);
      console.log('[DB] Railway Volume bulundu: /data');
      return '/data';
    }
  } catch (e) {}
  const local = path.join(__dirname, '..', 'data');
  console.log('[DB] Lokal data dizini:', local);
  return local;
}

const dataDir = getDataDir();
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'kurban-video.db');
const DB_BACKUP_PATH = path.join(dataDir, 'kurban-video.backup.db');

console.log('[DB] Veritabanı yolu:', DB_PATH);

// ─── KAYDETME (debounce + yedek) ─────────────────────────────────────────────
let saveTimer = null;
let _sqlDbRef = null; // forceSave için referans

function scheduleSave(sqlDb) {
  _sqlDbRef = sqlDb;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    forceSave(sqlDb);
  }, 800);
}

function forceSave(sqlDb) {
  try {
    const data = sqlDb.export();
    const buf = Buffer.from(data);
    // Önce geçici dosyaya yaz, sonra rename (atomic write — bozulma önleme)
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, buf);
    fs.renameSync(tmpPath, DB_PATH);
  } catch (e) {
    console.error('[DB] KAYIT HATASI:', e.message);
  }
}

// Process kapanmadan önce kaydet
function gracefulSave() {
  if (_sqlDbRef && saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    console.log('[DB] Graceful shutdown — son kayıt yapılıyor...');
    forceSave(_sqlDbRef);
    console.log('[DB] Kaydedildi.');
  }
}

process.on('SIGTERM', () => { gracefulSave(); process.exit(0); });
process.on('SIGINT',  () => { gracefulSave(); process.exit(0); });

// ─── STATEMENT WRAPPER ───────────────────────────────────────────────────────
class Statement {
  constructor(sqlDb, sql) {
    this._sqlDb = sqlDb;
    this._sql = sql;
  }

  run(...params) {
    try {
      this._sqlDb.run(this._sql, params.length ? params : []);
      scheduleSave(this._sqlDb);
      const rows = this._sqlDb.exec('SELECT last_insert_rowid() as id');
      const lastId = rows.length > 0 ? rows[0].values[0][0] : 0;
      return { changes: this._sqlDb.getRowsModified(), lastInsertRowid: lastId };
    } catch (e) {
      console.error('[DB] run hatası:', e.message, '| SQL:', this._sql);
      throw e;
    }
  }

  get(...params) {
    const stmt = this._sqlDb.prepare(this._sql);
    try {
      stmt.bind(params.length ? params : []);
      if (stmt.step()) return stmt.getAsObject();
      return undefined;
    } catch (e) {
      console.error('[DB] get hatası:', e.message, '| SQL:', this._sql);
      return undefined;
    } finally {
      try { stmt.free(); } catch (_) {}
    }
  }

  all(...params) {
    const stmt = this._sqlDb.prepare(this._sql);
    const results = [];
    try {
      stmt.bind(params.length ? params : []);
      while (stmt.step()) results.push(stmt.getAsObject());
    } catch (e) {
      console.error('[DB] all hatası:', e.message, '| SQL:', this._sql);
    } finally {
      try { stmt.free(); } catch (_) {}
    }
    return results;
  }
}

class DbWrapper {
  constructor(sqlDb) { this._sqlDb = sqlDb; }
  prepare(sql) { return new Statement(this._sqlDb, sql); }
  exec(sql) {
    try { this._sqlDb.run(sql); scheduleSave(this._sqlDb); }
    catch (e) { console.error('[DB] exec hatası:', e.message); throw e; }
  }
  pragma(str) { try { this._sqlDb.run(`PRAGMA ${str}`); } catch (e) {} }
}

// ─── SCHEMA ──────────────────────────────────────────────────────────────────
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS organizasyonlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad TEXT NOT NULL,
    yil INTEGER NOT NULL DEFAULT 2025,
    aktif INTEGER DEFAULT 1,
    olusturma DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS bagiscilar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organizasyon_id INTEGER NOT NULL,
    ad TEXT NOT NULL,
    telefon TEXT,
    video_var INTEGER DEFAULT 0,
    olusturma DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS videolar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bagisci_id INTEGER NOT NULL,
    organizasyon_id INTEGER NOT NULL,
    baslik TEXT,
    arama_etiketleri TEXT,
    cloudinary_url TEXT NOT NULL,
    cloudinary_public_id TEXT NOT NULL,
    thumbnail_url TEXT,
    video_no INTEGER DEFAULT 1,
    sure INTEGER DEFAULT 0,
    boyut INTEGER DEFAULT 0,
    olusturma DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS izleme_loglari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER,
    bagisci_id INTEGER,
    aranan_isim TEXT,
    ip_adresi TEXT,
    user_agent TEXT,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sistem_ayarlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anahtar TEXT NOT NULL UNIQUE,
    deger TEXT,
    olusturma DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

// ─── DB BAŞLATMA ─────────────────────────────────────────────────────────────
let _db = null;
let _initPromise = null;

async function getDb() {
  if (_db) return _db;
  // Eş zamanlı çağrıları tek promise'e bağla
  if (_initPromise) return _initPromise;
  _initPromise = _initDb();
  _db = await _initPromise;
  return _db;
}

async function _initDb() {
  const SQL = await initSqlJs();
  let sqlDb;

  // DB dosyasını yükle — bozuksa backup'tan kurtar
  if (fs.existsSync(DB_PATH)) {
    try {
      sqlDb = new SQL.Database(fs.readFileSync(DB_PATH));
      // Bütünlük kontrolü
      const check = sqlDb.exec("PRAGMA integrity_check");
      const result = check[0]?.values[0]?.[0];
      if (result !== 'ok') {
        console.error('[DB] Bütünlük hatası:', result, '— backup deneniyor');
        sqlDb.close();
        sqlDb = null;
      } else {
        console.log('[DB] Veritabanı yüklendi, bütünlük: OK');
      }
    } catch (e) {
      console.error('[DB] DB yükleme hatası:', e.message, '— backup deneniyor');
      sqlDb = null;
    }
  }

  // Backup'tan kurtar
  if (!sqlDb && fs.existsSync(DB_BACKUP_PATH)) {
    try {
      console.log('[DB] Backup\'tan kurtarılıyor...');
      sqlDb = new SQL.Database(fs.readFileSync(DB_BACKUP_PATH));
      console.log('[DB] Backup\'tan kurtarıldı!');
    } catch (e) {
      console.error('[DB] Backup da bozuk:', e.message, '— sıfırdan başlıyor');
      sqlDb = null;
    }
  }

  // Sıfırdan başla
  if (!sqlDb) {
    console.log('[DB] Yeni veritabanı oluşturuluyor');
    sqlDb = new SQL.Database();
  }

  sqlDb.run('PRAGMA foreign_keys = ON');
  sqlDb.run('PRAGMA journal_mode = WAL');
  sqlDb.run('PRAGMA synchronous = NORMAL');

  // Schema oluştur
  SCHEMA.split(';').map(s => s.trim()).filter(Boolean).forEach(s => {
    try { sqlDb.run(s); } catch (e) {}
  });

  // Migrations (her zaman try/catch — kolon zaten varsa hata verir, sorun değil)
  const migrations = [
    "ALTER TABLE bagiscilar ADD COLUMN video_var INTEGER DEFAULT 0",
    "ALTER TABLE videolar ADD COLUMN thumbnail_url TEXT",
    "ALTER TABLE videolar ADD COLUMN sure INTEGER DEFAULT 0",
    "ALTER TABLE videolar ADD COLUMN boyut INTEGER DEFAULT 0",
    // Hisse no (1-7) ve 7 adet arama etiketi
    "ALTER TABLE bagiscilar ADD COLUMN hisse_no INTEGER DEFAULT 1",
    "ALTER TABLE bagiscilar ADD COLUMN etiket1 TEXT",
    "ALTER TABLE bagiscilar ADD COLUMN etiket2 TEXT",
    "ALTER TABLE bagiscilar ADD COLUMN etiket3 TEXT",
    "ALTER TABLE bagiscilar ADD COLUMN etiket4 TEXT",
    "ALTER TABLE bagiscilar ADD COLUMN etiket5 TEXT",
    "ALTER TABLE bagiscilar ADD COLUMN etiket6 TEXT",
    "ALTER TABLE bagiscilar ADD COLUMN etiket7 TEXT",
    // Grup sistemi: aynı kurbandaki 7 hisse aynı grup_id'yi paylaşır
    "ALTER TABLE bagiscilar ADD COLUMN grup_id TEXT",
    // SMS gönderildi takibi
    "ALTER TABLE bagiscilar ADD COLUMN sms_gonderildi INTEGER DEFAULT 0",
    "ALTER TABLE bagiscilar ADD COLUMN sms_tarihi DATETIME",
  ];
  migrations.forEach(m => { try { sqlDb.run(m); } catch (_) {} });

  // Varsayılan ayarlar
  const defaults = [
    ['admin_sifre',              'icder2025'],
    ['site_logo_b64',            ''],
    ['admin_logo_b64',           ''],
    ['sifre_sistemi_aktif',      '0'],
    ['site_basligi',             'İÇDER Kurban Videoları'],
    ['aktif_organizasyon_id',    ''],
    ['isimle_arama_aktif',       '0'],
    ['varsayilan_video_basligi', '2026 İÇDER KURBAN ORGANİZASYONU'],
  ];
  defaults.forEach(([k, v]) => {
    try { sqlDb.run("INSERT OR IGNORE INTO sistem_ayarlari (anahtar, deger) VALUES (?, ?)", [k, v]); }
    catch (_) {}
  });

  // İlk kayıt + backup
  forceSave(sqlDb);
  try {
    fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
    console.log('[DB] İlk backup alındı');
  } catch (e) {}

  // Her 5 dakikada bir otomatik backup
  setInterval(() => {
    try {
      forceSave(sqlDb);
      fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
    } catch (e) {
      console.error('[DB] Otomatik backup hatası:', e.message);
    }
  }, 5 * 60 * 1000);

  return new DbWrapper(sqlDb);
}

module.exports = { getDb };
