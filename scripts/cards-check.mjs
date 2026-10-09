/**
 * Uji tampilan kartu tabulasi: grid 4 kolom + paginasi "muat 20 kartu lagi".
 * Memerlukan server berjalan dan data uji (lihat scripts/cards-fixture.ts).
 *
 *   BASE_URL=http://localhost:3995/newsroom-hub node scripts/cards-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3995/newsroom-hub';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  // login admin (melihat seluruh pool => data terbanyak)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', 'admin@newsroom.demo');
  await page.fill('#password', 'Demo123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });

  // 1. Beralih ke tampilan kartu (juga memastikan filter tetap terbawa)
  await page.goto(`${BASE}/dashboard/tabulasi?range=all`, { waitUntil: 'domcontentloaded' });
  check('tampilan daftar aktif secara bawaan', (await page.locator('.dtable').count()) > 0);
  await page.click('a[title="Grid 4 kolom, muat 20 kartu lagi"]');
  await page.waitForSelector('.panel.group', { timeout: 45000 });
  check('tampilan kartu dapat dipilih', page.url().includes('view=card'), page.url().split('?')[1]);
  check('filter tanggal tetap terbawa saat ganti tampilan', page.url().includes('range=all'));
  check('tabel daftar tidak lagi dirender', (await page.locator('.dtable').count()) === 0);

  // 2. Grid 4 kolom
  const grid = page.locator('#tabulasi-berita .grid').first();
  const cols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
  check('grid kartu 4 kolom di layar lebar', cols === 4, `${cols} kolom`);

  const first = await page.locator('#tabulasi-berita a.panel.group').count();
  check('kartu pertama dimuat 20 buah', first === 20, `${first} kartu`);

  const counterBefore = await page.locator('text=/Menampilkan \\d+ dari \\d+ kartu berita/').first().innerText();
  check('penghitung kartu menampilkan 20 dari total', /Menampilkan 20 dari \d+/.test(counterBefore), counterBefore);

  const btn = page.locator('button:has-text("Muat 20 Kartu Lagi")');
  check('tombol "Muat 20 Kartu Lagi" tersedia', (await btn.count()) > 0);

  // 3. Load more: kartu bertambah
  await btn.click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('#tabulasi-berita a.panel.group').length > n,
    first,
    { timeout: 45000 }
  );
  const after = await page.locator('#tabulasi-berita a.panel.group').count();
  check('klik "muat lagi" menambah kartu berikutnya', after > first, `${first} → ${after} kartu`);

  const counterAfter = await page.locator('text=/Menampilkan \\d+ dari \\d+ kartu berita/').first().innerText();
  check('penghitung diperbarui setelah muat lagi', counterAfter !== counterBefore, counterAfter);

  const hasDuplicate = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('#tabulasi-berita a.panel.group')].map((a) => a.getAttribute('href'));
    return ids.length !== new Set(ids).size;
  });
  check('tidak ada kartu duplikat setelah muat lagi', !hasDuplicate);

  // 4. Muat sampai habis
  let guard = 0;
  while ((await page.locator('button:has-text("Muat 20 Kartu Lagi")').count()) > 0 && guard < 5) {
    await page.locator('button:has-text("Muat 20 Kartu Lagi")').first().click();
    await page.waitForTimeout(2500);
    guard += 1;
  }
  const doneText = await page.locator('text=Semua berita pada filter ini sudah dimuat.').count();
  check('setelah habis muncul pesan "semua berita sudah dimuat"', doneText > 0);
  const totalNow = Number((await counterAfter.match(/dari (\d+)/)?.[1]) ?? 0);
  const finalCount = await page.locator('#tabulasi-berita a.panel.group').count();
  if (totalNow) check('jumlah kartu akhir sama dengan total data', finalCount === totalNow, `${finalCount}/${totalNow}`);

  // 5. Kembali ke tampilan daftar, pagination nomor tetap ada
  await page.click('a[title="Tabel padat dengan pagination"]');
  await page.waitForSelector('.dtable', { timeout: 45000 });
  check('dapat kembali ke tampilan daftar', (await page.locator('.dtable tbody tr').count()) > 0);
  check('URL tidak lagi memuat view=card', !page.url().includes('view=card'), page.url().split('?')[1]);

  // 6. Filter tetap bekerja pada tampilan kartu (pencarian judul uji)
  await page.goto(`${BASE}/dashboard/tabulasi?view=card&range=all&q=UJI-KARTU+1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.panel.group', { timeout: 45000 });
  const filtered = await page.locator('#tabulasi-berita a.panel.group').count();
  const titles = await page.locator('#tabulasi-berita a.panel.group h3').allInnerTexts();
  check(
    'pencarian pada tampilan kartu menyaring hasil',
    filtered > 0 && titles.every((t) => t.includes('UJI-KARTU 1')),
    `${filtered} kartu`
  );
} catch (e) {
  check(`exception: ${e.message}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan kartu lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
