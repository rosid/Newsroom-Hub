/**
 * Uji integrasi ekspor — sekarang HANYA CSV (PDF & Excel dihapus atas permintaan
 * pemilik aplikasi untuk mengurangi beban VPS).
 *
 * Yang dibuktikan:
 *  1. BUG LAMA tidak kembali — tautan ekspor WAJIB memuat basePath (dulu 404
 *     "No webpage was found" saat aplikasi dipasang di subpath).
 *  2. Hanya tombol CSV yang tersedia; tidak ada tombol Excel/PDF.
 *  3. Permintaan format lama (?format=xlsx / ?format=pdf) tetap dilayani sebagai CSV
 *     (bukan galat), supaya bookmark/tautan lama pengguna tidak rusak.
 *  4. Isi CSV benar: ringkasan + header tabel + baris data, dan blok rekap laporan.
 *  5. Ekspor menolak tanpa sesi (401).
 *
 *   BASE_URL=http://localhost:3968/newsroom-hub node scripts/export-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3968/newsroom-hub';
const BASE_PATH = new URL(BASE).pathname.replace(/\/$/, '');
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

/** Pecah CSV (pemisah ; + kutip ganda) menjadi baris berisi sel. */
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

const parseCsv = (text) =>
  text
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .map((line) => (line.length ? parseCsvLine(line) : []));

/** Ambil blok tabel: baris setelah header tertentu sampai baris kosong berikutnya. */
function blockAfter(lines, headerCell) {
  const start = lines.findIndex((r) => r[0] === headerCell);
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 1; i < lines.length && lines[i].length; i += 1) rows.push(lines[i]);
  return { header: lines[start], rows };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', 'admin@newsroom.demo');
  await page.fill('#password', 'Demo123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });

  // ================= TABULASI =================
  await page.goto(`${BASE}/dashboard/tabulasi?range=all`, { waitUntil: 'domcontentloaded' });
  const tabHrefs = await page
    .locator('[data-export-buttons] a[data-export-format]')
    .evaluateAll((els) => els.map((e) => ({ format: e.getAttribute('data-export-format'), href: e.getAttribute('href') })));
  check('tabulasi: HANYA tombol CSV yang tersedia', tabHrefs.length === 1 && tabHrefs[0].format === 'csv', tabHrefs.map((h) => h.format).join(', '));
  check(
    'tabulasi: tidak ada tombol Excel/PDF lagi',
    !tabHrefs.some((h) => ['xlsx', 'pdf'].includes(h.format)),
    tabHrefs.map((h) => h.format).join(', ')
  );
  check(
    'tabulasi: tautan ekspor memuat basePath (penyebab 404 sebelumnya)',
    tabHrefs.every((h) => h.href && h.href.startsWith(`${BASE_PATH}/api/export/news?`)),
    tabHrefs.map((h) => h.href).join(' | ').slice(0, 160)
  );
  check(
    'tabulasi: tidak ada tautan ekspor tanpa basePath',
    tabHrefs.every((h) => !h.href?.startsWith('/api/export')),
    tabHrefs.find((h) => h.href?.startsWith('/api/export'))?.href ?? 'bersih'
  );

  const origin = new URL(BASE).origin;
  const csvRes = await page.request.get(`${origin}${tabHrefs[0].href}`);
  check('tabulasi CSV: HTTP 200', csvRes.status() === 200, `HTTP ${csvRes.status()}`);
  check('tabulasi CSV: tipe konten text/csv', (csvRes.headers()['content-type'] || '').includes('text/csv'), csvRes.headers()['content-type']);
  check('tabulasi CSV: nama berkas .csv', (csvRes.headers()['content-disposition'] || '').includes('.csv'), csvRes.headers()['content-disposition']);
  const csvText = await csvRes.text();
  const csvLines = parseCsv(csvText);
  check('tabulasi CSV: ada baris header kolom', csvText.includes('"Nomor Berita"') && csvText.includes('"Judul"'));
  check('tabulasi CSV: baris data ada', csvLines.filter((r) => r.length > 5).length > 3, `${csvLines.length} baris`);
  const tabSummary = blockAfter(csvLines, 'Tabulasi');
  check(
    'tabulasi CSV: blok ringkasan di awal berkas',
    Boolean(tabSummary) && tabSummary.rows.some((r) => r[0] === 'Jumlah berita'),
    tabSummary ? tabSummary.rows.map((r) => `${r[0]}=${r[1]}`).join(', ') : 'tidak ditemukan'
  );
  const tabHeader = csvLines.find((r) => r[0] === 'No');
  check(
    'tabulasi CSV: header tabel lengkap (22 kolom)',
    Boolean(tabHeader) && tabHeader.length === 22,
    tabHeader ? `${tabHeader.length} kolom` : 'tidak ditemukan'
  );
  check(
    'tabulasi CSV: baris data sepanjang header',
    Boolean(tabHeader) && csvLines.filter((r) => r.length > 20 && r[0] !== 'No').every((r) => r.length === tabHeader.length)
  );

  // PENETRALAN FORMULA tidak boleh merusak data wajar (perbaikan audit SAN-1).
  // Sel placeholder "-" (Geo-tag / Waktu Tayang / Waktu Siar kosong) pernah ikut
  // berubah menjadi "'-" — asersi ini menjaga agar tidak terulang.
  const allCells = csvLines.flat();
  const neutralized = allCells.filter((c) => c.startsWith("'"));
  check(
    'tabulasi CSV: tidak ada sel data wajar yang diberi apostrof penetralan',
    neutralized.length === 0,
    neutralized.slice(0, 5).join(' | ') || 'tidak ada'
  );
  check(
    'tabulasi CSV: sel placeholder "-" tetap utuh',
    allCells.filter((c) => c === '-').length > 0 && !allCells.some((c) => c === "'-"),
    `${allCells.filter((c) => c === '-').length} sel "-"`
  );

  // Permintaan format lama (?format=xlsx / ?format=pdf) harus tetap dilayani sebagai CSV
  for (const legacy of ['xlsx', 'pdf']) {
    const res = await page.request.get(`${origin}${BASE_PATH}/api/export/news?tab=pusat&range=all&format=${legacy}`);
    check(
      `tabulasi: permintaan lama ?format=${legacy} dilayani sebagai CSV (bukan galat)`,
      res.status() === 200 && (res.headers()['content-type'] || '').includes('text/csv') && (res.headers()['content-disposition'] || '').includes('.csv'),
      `HTTP ${res.status()} · ${res.headers()['content-type']}`
    );
  }

  // ================= LAPORAN =================
  await page.goto(`${BASE}/dashboard/laporan?range=all`, { waitUntil: 'domcontentloaded' });
  const repHrefs = await page
    .locator('[data-export-buttons] a[data-export-format]')
    .evaluateAll((els) => els.map((e) => ({ format: e.getAttribute('data-export-format'), href: e.getAttribute('href') })));
  check('laporan: HANYA tombol CSV', repHrefs.length === 1 && repHrefs[0].format === 'csv', repHrefs.map((h) => h.format).join(', '));
  check(
    'laporan: tautan memuat basePath (penyebab 404 sebelumnya)',
    repHrefs.every((h) => h.href && h.href.startsWith(`${BASE_PATH}/api/export/report?`)),
    repHrefs.map((h) => h.href).join(' | ').slice(0, 160)
  );

  const repCsvRes = await page.request.get(`${origin}${repHrefs[0].href}`);
  check('laporan CSV: HTTP 200', repCsvRes.status() === 200, `HTTP ${repCsvRes.status()}`);
  check('laporan CSV: nama berkas .csv', (repCsvRes.headers()['content-disposition'] || '').includes('.csv'));
  const repText = await repCsvRes.text();
  const repLines = parseCsv(repText);
  check('laporan CSV: memuat blok Ringkasan Laporan', repText.includes('"Ringkasan Laporan"'));
  const repSummary = blockAfter(repLines, 'Ringkasan Laporan');
  check(
    'laporan CSV: ringkasan memuat total & periode',
    Boolean(repSummary) &&
      repSummary.rows.some((r) => r[0] === 'Total kiriman') &&
      repSummary.rows.some((r) => r[0] === 'Periode laporan'),
    repSummary ? repSummary.rows.length + ' baris' : 'tidak ditemukan'
  );
  check(
    'laporan CSV: memuat rekap kanal tayang & kategori tayang',
    repText.includes('"Kanal"') && repText.includes('"Total Tayang"'),
    repLines.find((r) => r[0] === 'Kanal')?.join(' | ') ?? '-'
  );
  check(
    'laporan CSV: memuat blok Per Biro dengan kolom Onair & Medsos',
    repLines.some((r) => r[0] === 'Biro / Unit' && r.includes('Tayang Onair') && r.includes('Tayang Medsos')),
    repLines.find((r) => r[0] === 'Biro / Unit')?.join(' | ').slice(0, 90) ?? '-'
  );
  const airedBlock = repLines.find((r) => r[0] === 'Nomor Berita');
  check(
    'laporan CSV: daftar Berita Tayang memuat kolom waktu tayang kanal',
    Boolean(airedBlock) && airedBlock.some((h) => /Waktu Onair/i.test(h)) && airedBlock.some((h) => /Waktu Medsos/i.test(h)),
    airedBlock?.join(' | ').slice(0, 90) ?? '-'
  );
  const repLegacy = await page.request.get(`${origin}${BASE_PATH}/api/export/report?range=all&format=xlsx`);
  check(
    'laporan: permintaan lama ?format=xlsx dilayani sebagai CSV',
    repLegacy.status() === 200 && (repLegacy.headers()['content-type'] || '').includes('text/csv'),
    `HTTP ${repLegacy.status()}`
  );

  // ================= Keamanan: wajib login =================
  const anon = await fetch(`${origin}${BASE_PATH}/api/export/news?format=csv`, { redirect: 'manual' });
  check('ekspor menolak tanpa sesi (401)', anon.status === 401, `HTTP ${anon.status}`);
  const anonReport = await fetch(`${origin}${BASE_PATH}/api/export/report?format=csv`, { redirect: 'manual' });
  check('ekspor laporan menolak tanpa sesi (401)', anonReport.status === 401, `HTTP ${anonReport.status}`);

  // Format tak dikenal tetap dilayani (default CSV)
  const weird = await page.request.get(`${origin}${BASE_PATH}/api/export/news?format=docx`);
  check('format tak dikenal tetap dilayani (default CSV)', weird.status() === 200 && (weird.headers()['content-type'] || '').includes('text/csv'), `HTTP ${weird.status()}`);
} catch (e) {
  check(`exception: ${e.message}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan ekspor lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
