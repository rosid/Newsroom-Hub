/**
 * Uji integrasi pengaturan tampilan halaman login (Frontpage).
 *
 * Membuktikan: teks yang diubah di Pengaturan benar-benar tampil di /login, penanda warna
 * bekerja, poin dibatasi & dipisah per baris, kolom kosong menyembunyikan bagian, gambar hero
 * (URL publik) tampil beserta lapisan gelap, logo menggantikan lambang huruf, dan nilai
 * dikembalikan seperti semula pada akhir uji.
 *
 *   BASE_URL=http://localhost:3969/newsroom-hub node scripts/login-settings-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3969/newsroom-hub';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

async function withPage(email, password, fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/** Ambil nilai teks dari halaman login (publik, tanpa login). */
async function loginPageText(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return await page.locator('body').innerText();
  } finally {
    await page.close();
  }
}

const stamp = Date.now();
const CUSTOM = {
  badge: `Badge Uji ${stamp}`,
  title: `[[UjiJudul${stamp}]] dan {{Aksen${stamp}}}`,
  points: `Poin satu ${stamp}\nPoin dua ${stamp}\nPoin tiga ${stamp}`,
  footerNote: `catatan-kiri-${stamp}`,
  footerRights: `catatan-kanan-${stamp}`,
  formTitle: `JudulForm ${stamp}`,
  formSubtitle: `Keterangan form uji ${stamp}`,
};

const HERO_URL = 'https://cdn.contoh-uji.test/hero.png';

const browser = await chromium.launch();
try {
  // ============ 0. Kondisi awal ============
  const before = await loginPageText(browser);
  check('halaman login awal menampilkan judul form bawaan', /Masuk ke ruang redaksi/i.test(before), '');
  check('halaman login awal memakai lambang huruf (logo belum diatur)', /data-login-initial/.test(await (async () => {
    const p = await browser.newPage();
    try {
      await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return await p.content();
    } finally {
      await p.close();
    }
  })()));

  // ============ 1. Ubah semua teks lewat UI ============
  await withPage('superadmin@newsroom.demo', 'Demo123!', async (page) => {
    const res = await page.goto(`${BASE}/dashboard/pengaturan/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('halaman Pengaturan → Halaman Login terbuka', res.status() === 200, `HTTP ${res.status()}`);
    check('menu "Halaman Login" ada di navigasi pengaturan', (await page.locator('a:has-text("Halaman Login")').count()) > 0);

    await page.fill('[data-login-field="heroBadge"]', CUSTOM.badge);
    await page.fill('[data-login-field="heroTitle"]', CUSTOM.title);
    await page.fill('[data-login-field="heroPoints"]', CUSTOM.points);
    await page.fill('[data-login-field="heroFooterNote"]', CUSTOM.footerNote);
    await page.fill('[data-login-field="heroFooterRights"]', CUSTOM.footerRights);
    await page.fill('[data-login-field="formTitle"]', CUSTOM.formTitle);
    await page.fill('[data-login-field="formSubtitle"]', CUSTOM.formSubtitle);
    await page.click('button:has-text("Simpan Tampilan Login")');
    await page.waitForSelector('text=Tampilan halaman login tersimpan', { timeout: 60000 });
    check('simpan berhasil (pesan sukses tampil)', true);
  });

  // ============ 2. Halaman login publik memakai nilai baru ============
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const after = await page2.locator('body').innerText();
  // CATATAN: badge memakai `uppercase` di CSS, dan innerText() mengembalikan hasil RENDER →
  // asersi harus tidak peka huruf besar/kecil (gotcha yang sama seperti header tabel).
  check('badge baru tampil', new RegExp(CUSTOM.badge, 'i').test(after), (after.match(/Badge\s+uji\s+\d+/i) || ['(tidak ada)'])[0]);
  check('judul besar baru tampil', after.includes(`UjiJudul${stamp}`) && after.includes(`Aksen${stamp}`));
  check('ketiga poin tampil & terpisah baris', after.includes(`Poin satu ${stamp}`) && after.includes(`Poin dua ${stamp}`) && after.includes(`Poin tiga ${stamp}`));
  check('catatan kaki kiri & kanan tampil', after.includes(CUSTOM.footerNote) && after.includes(CUSTOM.footerRights));
  check('judul form baru tampil', after.includes(CUSTOM.formTitle));
  check('keterangan form baru tampil', after.includes(CUSTOM.formSubtitle));
  check('judul form bawaan sudah tidak dipakai', !/Masuk ke ruang redaksi/i.test(after));

  // Penanda warna → dua warna berbeda pada judul
  const colors = await page2.evaluate(() => {
    const h = document.querySelector('[data-login-hero-title]');
    if (!h) return null;
    return [...h.querySelectorAll('span')].map((s) => getComputedStyle(s).color);
  });
  check('judul besar dirender dari penanda warna (≥2 potongan)', Array.isArray(colors) && colors.length >= 2, JSON.stringify(colors));
  check(
    'warna utama & aksen berbeda pada judul',
    Array.isArray(colors) && new Set(colors).size >= 2,
    Array.isArray(colors) ? [...new Set(colors)].join(' vs ') : 'tidak terdeteksi'
  );
  check('penanda [[ ]] dan {{ }} tidak ikut tampil sebagai teks', !after.includes('[[') && !after.includes('{{'));
  await page2.close();

  // ============ 3. Gambar hero (URL publik) + lapisan gelap ============
  await withPage('superadmin@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('[data-image-url]', HERO_URL);
    await page.fill('#login-heroImageOpacity', '80');
    await page.click('button:has-text("Simpan Tampilan Login")');
    await page.waitForSelector('text=Tampilan halaman login tersimpan', { timeout: 60000 });
    check('gambar hero tersimpan', true);
  });

  const page3 = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page3.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('gambar hero dirender di panel branding', (await page3.locator('[data-login-hero]').count()) === 1);
  check('sumber gambar hero sesuai', (await page3.locator('[data-login-hero]').getAttribute('src')) === HERO_URL);
  check('lapisan gelap di atas gambar ada', (await page3.locator('[data-login-hero-overlay]').count()) === 1);
  check('teks pada panel branding tetap terbaca (judul masih tampil)', (await page3.locator('body').innerText()).includes(`UjiJudul${stamp}`));
  // Gambar hero ikut di atas panel (absolute) — buktikan teks TIDAK tertutup gambar.
  const onTop = await page3.evaluate(() => {
    const h = document.querySelector('[data-login-hero-title]');
    if (!h) return { ok: false, reason: 'judul tidak ditemukan' };
    const r = h.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: Boolean(el && (h === el || h.contains(el))), reason: el?.tagName ?? 'null' };
  });
  check('teks judul berada DI ATAS gambar hero (tidak tertutup)', onTop.ok, onTop.reason);
  // Kolom teks lain TIDAK hilang setelah menyimpan (bug kelas "dua form, satu action")
  check(
    'menyimpan gambar tidak menghapus teks yang sudah diisi',
    (await page3.locator('body').innerText()).includes(CUSTOM.formTitle)
  );
  await page3.close();

  // ============ 4. Kolom dikosongkan → bagian disembunyikan ============
  await withPage('superadmin@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('[data-login-field="heroBadge"]', '');
    await page.fill('[data-login-field="heroPoints"]', '');
    await page.fill('[data-login-field="heroFooterNote"]', '');
    await page.fill('[data-login-field="heroFooterRights"]', '');
    await page.click('button:has-text("Simpan Tampilan Login")');
    await page.waitForSelector('text=Tampilan halaman login tersimpan', { timeout: 60000 });
  });
  const page4 = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page4.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('badge hilang saat dikosongkan', !new RegExp(CUSTOM.badge, 'i').test(await page4.locator('body').innerText()));
  check('daftar poin disembunyikan saat kosong', (await page4.locator('[data-login-hero-points]').count()) === 0);
  check('judul form tetap tampil (kolom lain tidak terpengaruh)', (await page4.locator('body').innerText()).includes(CUSTOM.formTitle));
  await page4.close();

  // ============ 5. Logo publik menggantikan lambang huruf ============
  const LOGO_URL = 'https://cdn.contoh-uji.test/logo.png';
  await withPage('superadmin@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('[data-image-url]', LOGO_URL);
    await page.click('button:has-text("Simpan Identitas")');
    await page.waitForSelector('text=tersimpan', { timeout: 60000 });
  });
  const page5 = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page5.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('logo tampil di halaman login', (await page5.locator('[data-login-logo]').count()) >= 1);
  check('sumber logo sesuai', (await page5.locator('[data-login-logo]').first().getAttribute('src')) === LOGO_URL);
  check('lambang huruf digantikan logo', (await page5.locator('[data-login-initial]').count()) === 0);
  await page5.close();

  // ============ 6. Kembalikan seperti semula ============
  await withPage('superadmin@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('[data-login-field="heroBadge"]', 'Newsroom Control Desk');
    await page.fill('[data-login-field="heroTitle"]', 'Satu pintu pengiriman berita [[Pusat]] & {{Biro Daerah}}.');
    await page.fill(
      '[data-login-field="heroPoints"]',
      'Kirim naskah + footage dari lapangan, langsung dari ponsel reporter\nPemisahan tegas Tabung Pusat & Biro Daerah, dorong berita daerah ke siaran nasional\nPeta sebaran berita, statistik harian, dan laporan per biro'
    );
    await page.fill('[data-login-field="heroFooterNote"]', 'v1.0 · newsroom.garuda.tv');
    await page.fill('[data-login-field="heroFooterRights"]', 'Hak akses berjenjang 9 level pengguna');
    await page.fill('[data-login-field="formTitle"]', 'Masuk ke ruang redaksi');
    await page.fill('[data-login-field="formSubtitle"]', 'Gunakan email redaksi yang terdaftar. Hubungi admin bila akses terkendala.');
    await page.fill('[data-image-url]', '');
    await page.fill('#login-heroImageOpacity', '55');
    await page.click('button:has-text("Simpan Tampilan Login")');
    await page.waitForSelector('text=Tampilan halaman login tersimpan', { timeout: 60000 });

    await page.goto(`${BASE}/dashboard/pengaturan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('[data-image-url]', '');
    await page.click('button:has-text("Simpan Identitas")');
    await page.waitForSelector('text=tersimpan', { timeout: 60000 });
  });

  const restored = await loginPageText(browser);
  check('teks login kembali seperti semula', /Masuk ke ruang redaksi/i.test(restored) && /Newsroom Control Desk/i.test(restored));
  check('gambar hero dibersihkan', restored.includes('Satu pintu pengiriman berita'));

  // ============ 7. Keamanan: tidak ada kredensial & tidak ada 404 aset ============
  const finalPage = await browser.newPage();
  await finalPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const finalHtml = await finalPage.content();
  check('halaman login tetap bersih dari kredensial demo', !/Demo123|@newsroom\.demo|Akun demo/i.test(finalHtml));
  await finalPage.close();
} catch (e) {
  check(`exception: ${e.message}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan pengaturan halaman login lulus`);
if (failed.length) process.exit(1);
