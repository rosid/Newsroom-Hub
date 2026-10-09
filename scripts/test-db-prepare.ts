/**
 * Persiapan database UJI (salinan di /tmp) — WAJIB dijalankan sebelum suite uji:
 *
 * 1. Memaksa Setting `storage` ke mode LOKAL, supaya uji tidak pernah menulis berkas
 *    ke storage PRODUKSI milik pengguna (DB aplikasi bisa memuat kredensial BunnyCDN asli).
 * 2. Menerapkan tabel tambahan (`prisma/*-ddl.sql`) dan kolom tambahan (`prisma/columns.json`)
 *    yang pada produksi dijalankan otomatis oleh `server.js` saat boot — sehingga salinan
 *    DB di /tmp memiliki skema yang sama dengan aplikasi live.
 *
 * Pengaman: menolak berjalan bila target bukan berkas di /tmp.
 *
 *   DATABASE_URL="file:/tmp/…/newsroom.db" npx tsx scripts/test-db-prepare.ts
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const url = process.env.DATABASE_URL || '';
if (!url.startsWith('file:/tmp/')) {
  console.error(
    `DITOLAK: skrip ini hanya untuk database uji di /tmp.\nDATABASE_URL saat ini: ${url || '(default aplikasi)'}`
  );
  process.exit(1);
}

type ColumnDef = { table: string; column: string; sql: string };

const prisma = new PrismaClient();

async function ensureTables() {
  const dir = path.join(process.cwd(), 'prisma');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('-ddl.sql'))
    .sort();
  const statements: string[] = [];
  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((st) => statements.push(st));
  }
  if (!statements.length) return;
  await prisma.$executeRawUnsafe('BEGIN IMMEDIATE');
  try {
    for (const st of statements) await prisma.$executeRawUnsafe(st);
    await prisma.$executeRawUnsafe('COMMIT');
  } catch (e) {
    await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
    throw e;
  }
  console.log(`[test-db] ${files.length} berkas DDL diterapkan (${statements.length} pernyataan)`);
}

async function ensureColumns() {
  const columns: ColumnDef[] = JSON.parse(readFileSync(path.join(process.cwd(), 'prisma', 'columns.json'), 'utf8'));
  const byTable = new Map<string, Set<string>>();
  for (const t of [...new Set(columns.map((c) => c.table))]) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${t}")`);
      byTable.set(t, new Set((rows || []).map((r) => String(r.name))));
    } catch {
      byTable.set(t, new Set());
    }
  }
  const pending = columns.filter((c) => !byTable.get(c.table)?.has(c.column));
  if (!pending.length) {
    console.log(`[test-db] semua kolom tambahan tersedia (${columns.length} diperiksa)`);
    return;
  }
  await prisma.$executeRawUnsafe('BEGIN IMMEDIATE');
  try {
    for (const c of pending) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${c.table}" ADD COLUMN "${c.column}" ${c.sql}`);
      console.log(`[test-db] kolom ${c.table}.${c.column} ditambahkan`);
    }
    await prisma.$executeRawUnsafe('COMMIT');
  } catch (e) {
    await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
    throw e;
  }
}

async function forceLocalStorage() {
  const row = await prisma.setting.findUnique({ where: { key: 'storage' } });
  const prev = row ? (JSON.parse(row.value) as { mode?: string; provider?: string }) : null;
  const value = JSON.stringify({
    mode: 'local',
    provider: 'local',
    endpoint: '',
    region: 'us-east-1',
    bucket: '',
    accessKeyId: '',
    secretEnc: '',
    publicBaseUrl: '',
    prefix: 'newsroom',
    forcePathStyle: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'uji-otomatis (database salinan)',
  });
  await prisma.setting.upsert({ where: { key: 'storage' }, update: { value }, create: { key: 'storage', value } });
  console.log(
    `[test-db] storage dipaksa ke mode lokal (sebelumnya: ${prev?.mode ?? 'belum ada'}${prev?.provider ? `/${prev.provider}` : ''}) — aman untuk uji tulis`
  );
}

(async () => {
  await ensureTables();
  await ensureColumns();
  await forceLocalStorage();
  console.log('[test-db] siap dipakai untuk pengujian');
})()
  .catch((e) => {
    console.error('[test-db] gagal:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
