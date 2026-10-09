// Entry point publikasi platform (PublishApp type=node).
// Menjalankan Next.js production server dan membaca PORT dari environment.
const { createServer } = require('http');
const fs = require('fs');
const path = require('path');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';

// Custom server TIDAK memuat berkas .env secara otomatis (Next hanya melakukannya
// lewat CLI). Muat di sini supaya SESSION_SECRET / STORAGE_DRIVER / DATABASE_URL
// tetap terbaca saat dijalankan dengan `node server.js`.
try {
  require('@next/env').loadEnvConfig(__dirname);
} catch (e) {
  console.warn('[boot] gagal memuat .env:', e.message);
}
// Fallback aman: db default aplikasi (relatif terhadap folder prisma/)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./newsroom.db';
  console.warn('[boot] DATABASE_URL tidak diset — memakai file:./newsroom.db');
}

/**
 * Pastikan tabel tambahan tersedia (chat, reset kata sandi, …).
 *
 * Database produksi TIDAK dapat dimigrasi dari luar (read-only untuk perkakas lain),
 * jadi tabel dibuat di sini saat boot. Setiap berkas `prisma/*-ddl.sql` dijalankan
 * satu kali per boot di dalam SATU transaksi (pernyataannya idempoten:
 * CREATE TABLE/INDEX IF NOT EXISTS) — satu transaksi berarti satu fsync, bukan satu
 * fsync per pernyataan.
 */
async function ensureSchema() {
  let prisma;
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    const ddlDir = path.join(__dirname, 'prisma');
    const files = fs
      .readdirSync(ddlDir)
      .filter((f) => f.endsWith('-ddl.sql'))
      .sort();

    const statements = [];
    for (const file of files) {
      const sql = fs
        .readFileSync(path.join(ddlDir, file), 'utf8')
        .split('\n')
        // Komentar dibuang LEBIH DULU, baru dipecah per ';' — kalau dipecah dulu,
        // pernyataan pertama (didahului blok komentar) ikut terbuang.
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((st) => statements.push({ file, sql: st }));
    }

    if (!statements.length) {
      console.log('[schema] tidak ada berkas DDL');
      return;
    }

    await prisma.$executeRawUnsafe('BEGIN IMMEDIATE');
    try {
      for (const st of statements) await prisma.$executeRawUnsafe(st.sql);
      await prisma.$executeRawUnsafe('COMMIT');
    } catch (e) {
      await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
      throw e;
    }

    // Laporkan tabel yang sekarang tersedia (membantu saat menelusuri masalah)
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Conversation','Message','PasswordReset') ORDER BY name"
    );
    const names = (tables || []).map((t) => t.name).join(', ');
    console.log(`[schema] skema siap (${files.length} berkas DDL, ${statements.length} pernyataan) — tabel: ${names}`);
  } catch (e) {
    // Aplikasi tetap dijalankan; halaman terkait menangani tabel yang belum ada dengan pesan ramah.
    console.warn('[schema] gagal menyiapkan skema tambahan:', String((e && e.message) || e).split('\n')[0]);
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

// Pastikan folder penyimpanan lokal (driver 'local') tersedia.
// MEDIA_UPLOAD_DIR dipakai uji otomatis agar tidak mengotori folder uploads/ aplikasi.
const localUploadDir = process.env.MEDIA_UPLOAD_DIR
  ? path.resolve(process.env.MEDIA_UPLOAD_DIR)
  : path.join(__dirname, 'uploads');
try {
  fs.mkdirSync(localUploadDir, { recursive: true });
} catch (e) {
  console.warn('[boot] tidak dapat membuat folder penyimpanan lokal:', e.message);
}

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

/**
 * Pastikan KOLOM baru tersedia pada tabel yang sudah ada (SQLite tidak mendukung
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), jadi keberadaan kolom diperiksa lebih
 * dahulu lewat PRAGMA table_info. Semua ALTER dijalankan dalam satu transaksi.
 *
 * Dipakai karena database produksi tidak dapat dimigrasi dari luar.
 */
async function ensureColumns() {
  let prisma;
  let columns = [];
  try {
    // Daftar kolom disimpan di prisma/columns.json supaya server & skrip uji memakai
    // sumber yang sama (tidak mungkin berbeda).
    columns = JSON.parse(fs.readFileSync(path.join(__dirname, 'prisma', 'columns.json'), 'utf8'));
  } catch (e) {
    console.warn('[schema] daftar kolom tidak terbaca:', String((e && e.message) || e).split('\n')[0]);
    return;
  }

  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();

    const existingByTable = new Map();
    for (const t of [...new Set(columns.map((c) => c.table))]) {
      try {
        const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info("${t}")`);
        existingByTable.set(t, new Set((rows || []).map((r) => String(r.name))));
      } catch {
        console.warn(`[schema] tabel ${t} belum tersedia, kolom dilewati`);
        existingByTable.set(t, new Set());
      }
    }

    const pending = columns.filter((c) => !existingByTable.get(c.table)?.has(c.column));
    if (!pending.length) {
      console.log(`[schema] semua kolom tambahan sudah tersedia (${columns.length} kolom diperiksa)`);
      return;
    }
    await prisma.$executeRawUnsafe('BEGIN IMMEDIATE');
    try {
      for (const c of pending) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "${c.table}" ADD COLUMN "${c.column}" ${c.sql}`);
        console.log(`[schema] kolom ${c.table}.${c.column} ditambahkan`);
      }
      await prisma.$executeRawUnsafe('COMMIT');
    } catch (e) {
      await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
      throw e;
    }
  } catch (e) {
    console.warn('[schema] gagal menambah kolom:', String((e && e.message) || e).split('\n')[0]);
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

ensureSchema()
  .then(() => ensureColumns())
  .then(() => app.prepare())
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`GarudaTV Newsroom Hub siap di port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Gagal memulai server:', err);
    process.exit(1);
  });
