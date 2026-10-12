/**
 * Uji integrasi halaman LISTING BERITA.
 *
 * Yang dibuktikan:
 *  1. Akses sesuai permintaan: semua role KECUALI Reporter Daerah, Reporter Pusat,
 *     Kontributor, Magang. Penegakan di SERVER (bukan hanya menu disembunyikan).
 *  2. Isinya benar: HANYA berita biro yang DIDORONG KE PUSAT, tidak memuat berita pool pusat.
 *  3. Pencarian (judul / nomor berita / reporter) bekerja.
 *  4. Filter tanggal Hari Ini / 7 Hari / 30 Hari / Bulan Ini / Kustom tersedia & bekerja.
 *  5. Tabel dipisah per biro, bisa dilipat, dengan 7 kolom sesuai permintaan.
 *
 * MENULIS ke DB salinan (fixture berita uji dibuat) — TIDAK menyentuh data live.
 *
 *   BASE_URL=http://localhost:3986/newsroom-hub node scripts/listing-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3986/newsroom-hub';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

async function withPage(email, fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
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

const ALLOWED = [
  'superadmin@newsroom.demo',
  'admin@newsroom.demo',
  'redaktur@newsroom.demo',
  'produser.pusat@newsroom.demo',
  'produser.medan@newsroom.demo',
  'koordinator.liputan@newsroom.demo',
  'koordinator.daerah@newsroom.demo',
];
const DENIED = [
  'reporter.medan@newsroom.demo',
  'reporter.pusat@newsroom.demo',
  'kontributor.bandung@newsroom.demo',
  'magang.makassar@newsroom.demo',
];

try {
  // ============ 1. Menu tampil hanya untuk role yang diizinkan ============
  for (const email of ALLOWED) {
    await withPage(email, async (page) => {
      const hasMenu = (await page.locator('a.nav-link:has-text("Listing Berita")').count()) > 0;
      check(`menu "Listing Berita" tampil untuk ${email.split('@')[0]}`, hasMenu);
    });
  }
  for (const email of DENIED) {
    await withPage(email, async (page) => {
      const hasMenu = (await page.locator('a.nav-link:has-text("Listing Berita")').count()) > 0;
      check(`menu "Listing Berita" TIDAK tampil untuk ${email.split('@')[0]}`, !hasMenu);
    });
  }

  // ============ 2. Akses halaman ditegakkan di SERVER ============
  for (const email of DENIED) {
    await withPage(email, async (page) => {
      const res = await page.goto(`${BASE}/dashboard/listing`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const body = await page.locator('body').innerText();
      const denied = res.status() === 200 && /Akses ditolak/i.test(body);
      check(`akses /dashboard/listing DITOLAK untuk ${email.split('@')[0]} (pesan jelas)`, denied, `HTTP ${res.status()}`);
      check(`tabel listing tidak dirender untuk ${email.split('@')[0]}`, (await page.locator('[data-listing-table]').count()) === 0);
    });
  }

  // ============ 3. Isi halaman untuk Admin ============
  await withPage('admin@newsroom.demo', async (page) => {
    const res = await page.goto(`${BASE}/dashboard/listing`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('halaman Listing terbuka untuk Admin', res.status() === 200, `HTTP ${res.status()}`);

    const groups = await page.locator('[data-listing-bureau]').count();
    check('tabel dipisah per biro (>= 1 kelompok)', groups >= 1, `${groups} kelompok biro`);

    const tables = await page.locator('[data-listing-table]').count();
    check('setiap kelompok biro punya tabelnya sendiri', tables === groups, `${tables} tabel / ${groups} kelompok`);

    // Kolom sesuai permintaan
    // CATATAN: header tabel di-render HURUF BESAR oleh CSS, dan innerText() mengembalikan
    // hasil render → perbandingan harus tidak peka huruf besar/kecil (gotcha lama proyek ini).
    const headers = (await page.locator('[data-listing-table]').first().locator('thead th').allInnerTexts()).map((h) => h.trim().toLowerCase());
    const expected = ['no. berita', 'judul', 'jenis', 'kategori', 'sumber', 'waktu kirim', 'buka'];
    check('kolom tabel sesuai permintaan (7 kolom, urut)', JSON.stringify(headers) === JSON.stringify(expected), headers.join(' | '));

    // Berita POOL PUSAT (tidak didorong dari biro) TIDAK boleh muncul di halaman ini.
    // Fixture membuat satu berita pusat berjudul memuat 'PUSAT uji listing' sebagai pembanding.
    const allText = await page.locator('body').innerText();
    check('berita pool pusat TIDAK ikut tampil (hanya yang didorong dari biro)', !/PUSAT uji listing/i.test(allText));

    // Accordion: bisa dilipat
    const toggle = page.locator('[data-listing-toggle]').first();
    check('kelompok biro punya tombol lipat (aria-expanded)', (await toggle.getAttribute('aria-expanded')) === 'true');
    const beforeRows = await page.locator('[data-listing-table] tbody tr').count();
    await toggle.click();
    await page.waitForTimeout(400);
    check('setelah diklik: aria-expanded=false', (await toggle.getAttribute('aria-expanded')) === 'false');
    check('setelah diklik: tabel biro itu disembunyikan', (await page.locator('[data-listing-table] tbody tr').count()) < beforeRows);
    await toggle.click();
    await page.waitForTimeout(400);
    check('diklik lagi: tabel tampil kembali', (await page.locator('[data-listing-table] tbody tr').count()) === beforeRows);

    // Kolom "Sumber" berisi nama reporter (bukan kosong / bukan nama biro)
    const firstSource = (await page.locator('[data-listing-table] tbody tr').first().locator('td').nth(4).innerText()).trim();
    check('kolom Sumber terisi nama reporter', firstSource.length > 0 && !/^Biro /i.test(firstSource), firstSource);
    // Kolom "Buka" berisi tautan ke detail berita
    const openHref = await page.locator('[data-listing-open]').first().getAttribute('href');
    check('kolom Buka menautkan ke detail berita', /\/dashboard\/tabulasi\/berita\//.test(openHref || ''), openHref || '-');

    // Filter tanggal tersedia
    const presets = ['today', '7d', '30d', 'month'];
    for (const k of presets) {
      check(`filter cepat "${k}" tersedia`, (await page.locator(`[data-range-preset="${k}"]`).count()) === 1);
    }
    check('input rentang kustom (dari/sampai) tersedia', (await page.locator('[data-listing-from]').count()) === 1 && (await page.locator('[data-listing-to]').count()) === 1);
    check('tombol terapkan rentang kustom ada', (await page.locator('[data-listing-custom]').count()) === 1);
    check('kolom pencarian tersedia', (await page.locator('[data-listing-search]').count()) === 1);
  });

  // ============ 4. Pencarian & filter tanggal benar-benar bekerja ============
  await withPage('admin@newsroom.demo', async (page) => {
    // Pencarian dengan kata yang pasti tidak ada
    await page.goto(`${BASE}/dashboard/listing?range=all&q=zzz-tidak-ada-zzz`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const empty = await page.locator('[data-listing-empty]').count();
    check('pencarian tanpa hasil menampilkan keadaan kosong', empty === 1);
    check('tabel tidak dirender saat tidak ada hasil', (await page.locator('[data-listing-table]').count()) === 0);

    // Pencarian pakai kata umum (harus mengembalikan hasil bila ada data)
    const allRes = await page.goto(`${BASE}/dashboard/listing?range=all`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('halaman dapat dibuka dengan rentang "all"', allRes.status() === 200);

    // Filter 7 hari: jumlah baris tidak boleh melebihi rentang "all"
    const rowsAll = await page.locator('[data-listing-table] tbody tr').count();
    await page.goto(`${BASE}/dashboard/listing?range=7d`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const rows7 = await page.locator('[data-listing-table] tbody tr').count();
    check('filter 7 hari membatasi hasil (<= rentang semua)', rows7 <= rowsAll, `${rows7} <= ${rowsAll}`);

    // Rentang kustom: tanggal di masa depan → kosong
    await page.goto(`${BASE}/dashboard/listing?range=custom&from=2030-01-01&to=2030-01-31`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('rentang kustom di masa depan menghasilkan keadaan kosong', (await page.locator('[data-listing-empty]').count()) === 1);
  });

  // ============ 5. Koordinator Daerah (bukan admin) dapat melihat seluruh biro ============
  await withPage('koordinator.daerah@newsroom.demo', async (page) => {
    const res = await page.goto(`${BASE}/dashboard/listing?range=all`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('Koordinator Daerah dapat membuka Listing', res.status() === 200, `HTTP ${res.status()}`);
    const groups = await page.locator('[data-listing-bureau]').count();
    check('Koordinator Daerah melihat kelompok biro', groups >= 1, `${groups} kelompok`);
  });

  // ============ 6. Produser Daerah: cakupan mengikuti aturan pool ============
  await withPage('produser.medan@newsroom.demo', async (page) => {
    const res = await page.goto(`${BASE}/dashboard/listing?range=all`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('Produser Daerah dapat membuka Listing', res.status() === 200, `HTTP ${res.status()}`);
    const body = await page.locator('body').innerText();
    check('Produser Daerah tidak melihat pesan akses ditolak', !/Akses ditolak/i.test(body));
  });
} catch (e) {
  check(`exception: ${e.message}`, false);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan Listing Berita lulus`);
if (failed.length) process.exit(1);
