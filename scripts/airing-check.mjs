/**
 * Uji integrasi fitur TAYANG ONAIR & MEDSOS:
 * - tombol "Siarkan Berita" sudah diganti "Tayang Onair" + ada "Tayang Medsos" di kolom tindakan,
 * - menandai tayang mengubah status jadi Disiarkan + badge/waktu tayang tampil di detail,
 * - berita dapat tayang di KEDUA kanal (kanal kedua tetap bisa ditandai setelah kanal pertama),
 * - menarik tayang satu kanal: kanal lain tetap tayang, status tetap Disiarkan,
 * - menarik kedua kanal: status kembali Terverifikasi,
 * - halaman Laporan menampilkan KPI, grafik, dan tabel Tayang Onair/Medsos + filter kanal,
 * - ekspor CSV laporan memuat rekap kanal tayang (PDF/Excel sudah dihapus).
 *
 *   BASE_URL=http://localhost:3964/newsroom-hub node scripts/airing-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3964/newsroom-hub';
const ORIGIN = new URL(BASE).origin;
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

async function withPage(email, fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#email', email);
    await page.fill('#password', 'Demo123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const title = `Uji Tayang Kanal ${Date.now()}`;
let newsUrl = '';

try {
  // ============ 1. Kirim berita & validasi (agar berstatus Terverifikasi) ============
  await withPage('reporter.pusat@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded' });
    await page.fill('#title', title);
    await page.selectOption('#category', { label: 'Teknologi' });
    await page.locator('[contenteditable="true"]').click();
    await page.keyboard.type('JAKARTA — Berita uji untuk memverifikasi tombol Tayang Onair dan Tayang Medsos.');
    await page.fill('#location', 'Jakarta Pusat');
    await page.selectOption('#province', { label: 'DKI Jakarta' });
    await page.click('button:has-text("Kirim Berita")');
    await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 90000 });
    newsUrl = page.url();
    check('berita uji terkirim (status Menunggu Persetujuan)', (await page.locator('text=Menunggu Persetujuan').count()) > 0);
    check(
      'berita yang belum terverifikasi TIDAK menampilkan tombol tayang',
      (await page.locator('button:has-text("Tayang Onair")').count()) === 0 &&
        (await page.locator('button:has-text("Tayang Medsos")').count()) === 0
    );
  });

  await withPage('produser.pusat@newsroom.demo', async (page) => {
    await page.goto(newsUrl, { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("Validasi Berita")');
    await page.waitForSelector('[role="dialog"]');
    await page.click('button:has-text("Verifikasi / Lolos")');
    await page.fill('#review-note', 'Naskah siap tayang.');
    await page.click('[role="dialog"] button:has-text("Simpan Hasil Validasi")');
    await page.waitForTimeout(3000);
    check('berita terverifikasi', (await page.locator('text=Terverifikasi').count()) > 0);
  });

  // ============ 2. Redaktur: tombol baru (bukan "Siarkan Berita") ============
  await withPage('redaktur@newsroom.demo', async (page) => {
    await page.goto(newsUrl, { waitUntil: 'domcontentloaded' });
    check('tombol lama "Siarkan Berita" sudah TIDAK ada', (await page.locator('button:has-text("Siarkan Berita")').count()) === 0);
    check('tombol "Tayang Onair" tersedia', (await page.locator('button:has-text("Tayang Onair")').count()) > 0);
    check('tombol "Tayang Medsos" tersedia', (await page.locator('button:has-text("Tayang Medsos")').count()) > 0);

    // Tandai ONAIR (dengan opsi siaran nasional)
    await page.click('button:has-text("Tayang Onair")');
    await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
    check('dialog Tayang Onair memuat opsi siaran nasional', (await page.locator('[role="dialog"] input[name="isNational"]').count()) > 0);
    check('dialog memakai kanal ONAIR', (await page.locator('[role="dialog"] input[name="channel"]').inputValue()) === 'ONAIR');
    await page.fill('#onair-note', 'Tayang di buletin siang');
    await page.click('[role="dialog"] button:has-text("Tayang Onair")');
    await page.waitForTimeout(3500);
    await page.reload({ waitUntil: 'domcontentloaded' });

    check('status berubah menjadi Disiarkan', (await page.locator('text=Disiarkan').count()) > 0);
    check('badge "Tayang Onair" tampil di detail', (await page.locator('text=Tayang Onair').count()) > 0);
    check('tombol berubah menjadi "Tarik ONAIR"', (await page.locator('button:has-text("Tarik ONAIR")').count()) > 0);
    check('tombol "Tayang Medsos" masih tersedia (kanal kedua)', (await page.locator('button:has-text("Tayang Medsos")').count()) > 0);

    // Tandai MEDSOS pada berita yang sudah ONAIR
    await page.click('button:has-text("Tayang Medsos")');
    await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
    check('dialog memakai kanal MEDSOS', (await page.locator('[role="dialog"] input[name="channel"]').inputValue()) === 'MEDSOS');
    await page.fill('#medsos-note', 'Instagram GarudaTV');
    await page.click('[role="dialog"] button:has-text("Tayang Medsos")');
    await page.waitForTimeout(3500);
    await page.reload({ waitUntil: 'domcontentloaded' });

    check('berita tercatat tayang di KEDUA kanal', (await page.locator('text=Tayang Medsos').count()) > 0 && (await page.locator('text=Tayang Onair').count()) > 0);
    check('kedua tombol berubah menjadi tarik', (await page.locator('button:has-text("Tarik ONAIR")').count()) > 0 && (await page.locator('button:has-text("Tarik MEDSOS")').count()) > 0);
    const detail = await page.locator('body').innerText();
    check('panel detail memuat waktu tayang per kanal', /Tayang ONAIR/.test(detail) && /Tayang MEDSOS/.test(detail));
    check('riwayat proses memuat entri tayang kanal', /Tayang ONAIR/.test(detail) && /Tayang Medsos|Tayang MEDSOS/.test(detail));

    // Tarik MEDSOS saja → status tetap Disiarkan karena ONAIR masih tayang
    await page.click('button:has-text("Tarik MEDSOS")');
    await page.waitForTimeout(3200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    check('menarik MEDSOS: ONAIR tetap tayang', (await page.locator('button:has-text("Tarik ONAIR")').count()) > 0);
    check('menarik MEDSOS: status masih Disiarkan', (await page.locator('text=Disiarkan').count()) > 0);
    check('menarik MEDSOS: tombol "Tayang Medsos" muncul kembali', (await page.locator('button:has-text("Tayang Medsos")').count()) > 0);

    // Tarik ONAIR (kanal terakhir) → status kembali Terverifikasi
    await page.click('button:has-text("Tarik ONAIR")');
    await page.waitForTimeout(3200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    check('menarik kanal terakhir: status kembali Terverifikasi', (await page.locator('text=Terverifikasi').count()) > 0);
    check('menarik kanal terakhir: tombol tayang tersedia kembali', (await page.locator('button:has-text("Tayang Onair")').count()) > 0);

    // Tombol "Tarik Semua Tayang": tandai dua kanal lalu tarik sekaligus
    for (const [btn, note] of [
      ['Tayang Onair', '#onair-note'],
      ['Tayang Medsos', '#medsos-note'],
    ]) {
      await page.click(`button:has-text("${btn}")`);
      await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
      await page.fill(note, `Uji tarik semua (${btn})`);
      await page.click(`[role="dialog"] button:has-text("${btn}")`);
      await page.waitForTimeout(3000);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    check('tombol "Tarik Semua Tayang" tersedia saat dua kanal tayang', (await page.locator('button:has-text("Tarik Semua Tayang")').count()) > 0);
    await page.click('button:has-text("Tarik Semua Tayang")');
    await page.waitForTimeout(3500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    check('menarik semua tayang: status kembali Terverifikasi', (await page.locator('text=Terverifikasi').count()) > 0);
    check('menarik semua tayang: kedua tombol tayang tersedia kembali', (await page.locator('button:has-text("Tayang Onair")').count()) > 0 && (await page.locator('button:has-text("Tayang Medsos")').count()) > 0);

    // Kembalikan ke tayang ONAIR + MEDSOS untuk pengujian laporan
    for (const [btn, dialogBtn, note] of [
      ['Tayang Onair', 'Tayang Onair', '#onair-note'],
      ['Tayang Medsos', 'Tayang Medsos', '#medsos-note'],
    ]) {
      await page.click(`button:has-text("${btn}")`);
      await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
      await page.fill(note, `Uji laporan ${btn}`);
      await page.click(`[role="dialog"] button:has-text("${dialogBtn}")`);
      await page.waitForTimeout(3000);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    check('berita kembali tayang di kedua kanal untuk uji laporan', (await page.locator('button:has-text("Tarik ONAIR")').count()) > 0 && (await page.locator('button:has-text("Tarik MEDSOS")').count()) > 0);
  });

  // ============ 3. Laporan: KPI, grafik, tabel kanal tayang ============
  await withPage('admin@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/laporan?range=all`, { waitUntil: 'domcontentloaded' });

    const kpiText = await page.locator('.kpi').allInnerTexts();
    check('KPI "Tayang Onair" tersedia', kpiText.some((t) => /TAYANG ONAIR/i.test(t)), kpiText.slice(0, 3).join(' | ').slice(0, 80));
    check('KPI "Tayang Medsos" tersedia', kpiText.some((t) => /TAYANG MEDSOS/i.test(t)));
    check('KPI "Tayang Onair & Medsos" tersedia', kpiText.some((t) => /ONAIR & MEDSOS/i.test(t)));
    const onairKpi = Number((kpiText.find((t) => /TAYANG ONAIR$/i.test(t.trim().split('\n').slice(0, 1).join('')) || /TAYANG ONAIR/i.test(t)) || '').match(/(\d+)/)?.[1] ?? '0');
    check('angka KPI Tayang Onair > 0', onairKpi > 0, `${onairKpi}`);

    await page.waitForTimeout(1500);
    check('grafik komposisi kanal tayang tampil', (await page.locator('[data-chart="air-channel"] svg.recharts-surface').count()) > 0);
    check('grafik tayang per kategori tampil', (await page.locator('[data-chart="air-category"] svg.recharts-surface').count()) > 0);
    check('tren harian memuat legenda tayang onair & medsos', (await page.locator('text=Tayang Onair').count()) > 0 && (await page.locator('text=Tayang Medsos').count()) > 0);

    const airTable = page.locator('[data-table="air-category"]');
    check('tabel rekap tayang per kategori tampil', (await airTable.count()) > 0);
    const airTableText = await airTable.innerText();
    check(
      'tabel rekap memuat kolom Onair & Medsos',
      /Tayang Onair/i.test(airTableText) && /Tayang Medsos/i.test(airTableText),
      airTableText.replace(/\s+/g, ' ').slice(0, 80)
    );

    const airedTable = page.locator('[data-table="aired-news"]');
    check('tabel "Berita Tayang" tampil', (await airedTable.count()) > 0);
    const airedText = await airedTable.innerText();
    check('tabel berita tayang memuat berita uji', airedText.includes(title), airedText.replace(/\s+/g, ' ').slice(0, 90));
    check('tabel menampilkan kanal ONAIR & MEDSOS beserta waktunya', /ONAIR/.test(airedText) && /MEDSOS/.test(airedText));

    // Filter kanal
    await page.click('[data-kanal="ONAIR"]');
    await page.waitForTimeout(2000);
    const onlyOnair = await page.locator('[data-table="aired-news"]').innerText();
    check('filter "Tayang Onair" menyaring daftar', /ONAIR/.test(onlyOnair), onlyOnair.replace(/\s+/g, ' ').slice(0, 70));
    await page.click('[data-kanal="MEDSOS"]');
    await page.waitForTimeout(2000);
    const onlyMedsos = await page.locator('[data-table="aired-news"]').innerText();
    check('filter "Tayang Medsos" menyaring daftar', /MEDSOS/.test(onlyMedsos), onlyMedsos.replace(/\s+/g, ' ').slice(0, 70));
    await page.click('[data-kanal="SEMUA"]');
    await page.waitForTimeout(2000);

    // Rekap per biro memuat kolom kanal
    // Catatan: header tabel di-render HURUF BESAR oleh CSS (text-transform), dan innerText()
    // mengembalikan teks hasil render — jadi perbandingan harus case-insensitive.
    const bureauHeaders = await page.locator('section:has-text("Rekap per Biro") table thead th').allInnerTexts();
    check(
      'tabel rekap per biro memuat kolom Onair & Medsos',
      bureauHeaders.some((h) => /^onair$/i.test(h.trim())) && bureauHeaders.some((h) => /^medsos$/i.test(h.trim())),
      bureauHeaders.join(', ')
    );
  });

  // ============ 4. Ekspor CSV laporan memuat rekap kanal tayang ============
  // CATATAN: ekspor PDF & Excel sudah dihapus (hanya CSV) — lihat src/lib/export/data.ts.
  await withPage('admin@newsroom.demo', async (page) => {
    const base = new URL(BASE).pathname;
    const res = await page.request.get(`${ORIGIN}${base}/api/export/report?range=all&format=csv`);
    check('ekspor CSV laporan berhasil', res.status() === 200, `HTTP ${res.status()}`);
    const csv = await res.text();
    check('CSV memuat rekap Kanal Tayang', csv.includes('"Kanal"') && csv.includes('"Jumlah Berita"'));
    check(
      'CSV memuat 4 kategori kanal tayang',
      /Tayang Onair saja/.test(csv) && /Tayang Onair & Medsos/.test(csv) && /Belum tayang/.test(csv),
      csv.split('\r\n').find((l) => l.includes('Tayang Onair saja'))?.slice(0, 70) ?? '-'
    );
    check('CSV memuat rekap Tayang per Kategori', /Rekap Tayang per Kategori|"Total Tayang"/.test(csv));
    check('CSV memuat daftar Berita Tayang + waktu kanal', /Waktu Onair/.test(csv) && /Waktu Medsos/.test(csv));
    check('CSV memuat berita uji tayang', csv.includes(title), title.slice(0, 40));
    // Permintaan format lama (Excel/PDF) kini dilayani sebagai CSV, bukan galat
    const legacy = await page.request.get(`${ORIGIN}${base}/api/export/report?range=all&format=xlsx`);
    check(
      'permintaan lama ?format=xlsx dilayani sebagai CSV (tidak 500/404)',
      legacy.status() === 200 && (legacy.headers()['content-type'] || '').includes('text/csv'),
      `HTTP ${legacy.status()}`
    );
  });

  // Bersihkan berita uji
  await withPage('admin@newsroom.demo', async (page) => {
    await page.goto(newsUrl, { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("Hapus Berita")');
    await page.waitForSelector('[role="dialog"]');
    await page.click('[role="dialog"] button:has-text("Hapus Permanen")');
    await page.waitForTimeout(3000);
    check('berita uji dibersihkan', true);
  });
} catch (e) {
  check(`exception: ${e.message}`, false);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan tayang kanal lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
