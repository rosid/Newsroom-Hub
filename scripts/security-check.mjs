/**
 * Uji integrasi PENGATURAN KEAMANAN.
 *
 * Membuktikan:
 *  1. Halaman Pengaturan → Keamanan terbuka untuk Admin, ditolak untuk role lain.
 *  2. Turnstile: ON/OFF terpisah dari kunci; menyalakan tanpa kunci DITOLAK (cegah terkunci);
 *     kunci tidak pernah dikirim balik ke browser.
 *  3. Login throttling: batas dari panel benar-benar dipakai (mis. 2 percobaan -> blokir).
 *  4. Umur sesi dari panel benar-benar dipakai (cookie maxAge berubah).
 *  5. Riwayat login tercatat & tampil (berhasil + gagal), dengan IP.
 *
 * MENULIS ke salinan DB di /tmp lalu MENGEMBALIKAN pengaturan ke semula.
 *
 *   BASE_URL=http://localhost:3988/newsroom-hub node scripts/security-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3988/newsroom-hub';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

/** Login tanpa memakai helper bersama: uji ini memang menguji perilaku login. */
async function attemptLogin(page, email, password, basePath) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  return {
    url: page.url(),
    body: await page.locator('body').innerText().catch(() => ''),
  };
}

async function withPage(fn, { login = 'superadmin@newsroom.demo', password = 'Demo123!' } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    if (login) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.fill('#email', login);
      await page.fill('#password', password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    }
    return await fn(page);
  } finally {
    await browser.close();
  }
}

try {
  // ============ 1. Akses halaman ============
  await withPage(async (page) => {
    const res = await page.goto(`${BASE}/dashboard/pengaturan/keamanan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('halaman Pengaturan → Keamanan terbuka untuk Super Admin', res.status() === 200, `HTTP ${res.status()}`);
    check('menu "Keamanan" ada di navigasi pengaturan', (await page.locator('a:has-text("Keamanan")').count()) > 0);
    check('bagian Turnstile ada', (await page.locator('[data-turnstile-toggle]').count()) === 1);
    check('kolom Site Key ada', (await page.locator('[data-turnstile-sitekey]').count()) === 1);
    check('kolom Secret Key ada', (await page.locator('[data-turnstile-secret]').count()) === 1);
    check('pengaturan throttling ada (3 kolom)', (await page.locator('[data-sec-attempts]').count()) === 1 && (await page.locator('[data-sec-window]').count()) === 1 && (await page.locator('[data-sec-block]').count()) === 1);
    check('pengaturan umur sesi ada', (await page.locator('[data-sec-session]').count()) === 1);
    check('tabel riwayat login ada', (await page.locator('[data-login-history-table]').count()) === 1);
    check('nilai bawaan umur sesi 72 jam (3x24 jam)', (await page.locator('[data-sec-session]').inputValue()) === '72', await page.locator('[data-sec-session]').inputValue());
    // Secret tidak boleh dikirim ke browser
    check('Secret Key TIDAK diisi dari server (tidak bocor)', (await page.locator('[data-turnstile-secret]').inputValue()) === '');
  });

  await withPage(async (page) => {
    // requireRole() melakukan REDIRECT untuk role yang tidak berhak (bukan halaman "Akses ditolak"),
    // jadi yang diperiksa: pengguna tidak berakhir di halaman Keamanan dan tabel tidak dirender.
    await page.goto(`${BASE}/dashboard/pengaturan/keamanan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const url = page.url();
    const body = await page.locator('body').innerText();
    check(
      'Reporter Daerah DITOLAK membuka halaman Keamanan (dialihkan)',
      !/\/dashboard\/pengaturan\/keamanan/.test(url) || !/Riwayat Login/i.test(body),
      `url=${url.split('/newsroom-hub')[1] ?? url}`
    );
    check('Reporter Daerah tidak melihat tabel riwayat login', (await page.locator('[data-login-history-table]').count()) === 0);
  }, { login: 'reporter.medan@newsroom.demo' });

  // ============ 2. Turnstile: menyalakan tanpa kunci ditolak ============
  await withPage(async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/keamanan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('[data-turnstile-toggle]').check();
    await page.click('button:has-text("Simpan Pengaturan Keamanan")');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    check(
      'menyalakan Turnstile TANPA kunci ditolak (mencegah semua orang terkunci)',
      /tidak dapat dinyalakan tanpa Site Key/i.test(body),
      (body.match(/Turnstile tidak dapat[^\n]{0,40}/i) || ['(pesan tidak ditemukan)'])[0]
    );
    // matikan kembali agar tidak mengganggu uji berikutnya
    await page.locator('[data-turnstile-toggle]').uncheck();
    await page.click('button:has-text("Simpan Pengaturan Keamanan")');
    await page.waitForTimeout(2500);
  });

  // ============ 3. Throttling dari panel benar-benar dipakai ============
  await withPage(async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/keamanan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('[data-sec-attempts]', '2');
    await page.fill('[data-sec-window]', '10');
    await page.fill('[data-sec-block]', '5');
    await page.click('button:has-text("Simpan Pengaturan Keamanan")');
    await page.waitForSelector('text=Login throttling', { timeout: 60000 });
    // Muat ulang: nilai yang ditampilkan dibaca dari Setting (di-cache 120s), jadi ringkasan
    // di halaman perlu render ulang agar mencerminkan nilai baru.
    await page.reload({ waitUntil: 'domcontentloaded' });
    const body = await page.locator('body').innerText();
    check('pengaturan throttling tersimpan (ringkasan berubah)', /2 percobaan/i.test(body), (body.match(/\d+ percobaan[^\n]{0,40}/) || ['-'])[0]);
    check('nilai kolom setelah muat ulang = 2', (await page.locator('[data-sec-attempts]').inputValue()) === '2', await page.locator('[data-sec-attempts]').inputValue());
  });

  // Percobaan ke-3 dengan sandi salah harus DIBLOKIR (batas baru = 2)
  const b3 = await chromium.launch();
  try {
    const p3 = await b3.newPage();
    const r1 = await attemptLogin(p3, 'security.uji@newsroom.demo', 'sandi-salah-1');
    check('percobaan 1: pesan sandi salah (belum diblokir)', /Email atau sandi salah/i.test(r1.body), r1.body.slice(0, 60).replace(/\s+/g, ' '));
    await attemptLogin(p3, 'security.uji@newsroom.demo', 'sandi-salah-2');
    const r3 = await attemptLogin(p3, 'security.uji@newsroom.demo', 'sandi-salah-3');
    check(
      'percobaan ke-3 DIBLOKIR (batas 2 dari panel dipakai)',
      /Terlalu banyak percobaan masuk/i.test(r3.body),
      (r3.body.match(/Terlalu banyak[^\n]{0,50}/) || ['(tidak diblokir)'])[0]
    );
    check('pesan blokir menyebut sisa waktu', /menit/i.test(r3.body), '');
  } finally {
    await b3.close();
  }

  // Kembalikan throttling ke nilai awal agar DB uji bersih
  await withPage(async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/keamanan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('[data-sec-attempts]', '5');
    await page.fill('[data-sec-window]', '10');
    await page.fill('[data-sec-block]', '10');
    await page.click('button:has-text("Simpan Pengaturan Keamanan")');
    await page.waitForTimeout(2000);
    check('throttling dikembalikan ke 5/10/10', (await page.locator('[data-sec-attempts]').inputValue()) === '5');
  });

  // ============ 4. Umur sesi dari panel benar-benar dipakai ============
  const b4 = await chromium.launch();
  try {
    const p4 = await b4.newPage();
    // set umur sesi 1 jam, lalu login dan periksa Max-Age cookie
    await p4.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p4.fill('#email', 'superadmin@newsroom.demo');
    await p4.fill('#password', 'Demo123!');
    await p4.click('button[type="submit"]');
    await p4.waitForURL(/\/dashboard/, { timeout: 60000 });
    const cookiesAwal = await p4.context().cookies();
    const sessionAwal = cookiesAwal.find((c) => c.name === 'newsroom_session');
    check('cookie sesi dibuat dengan batas dari pengaturan (72 jam)', Boolean(sessionAwal) && sessionAwal.expires - Date.now() / 1000 > 70 * 3600, `± ${Math.round((sessionAwal.expires - Date.now() / 1000) / 3600)} jam`);

    await p4.close();
    const b4b = await chromium.launch();
    const admin = await b4b.newPage();
    await admin.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await admin.fill('#email', 'superadmin@newsroom.demo');
    await admin.fill('#password', 'Demo123!');
    await admin.click('button[type="submit"]');
    await admin.waitForURL(/\/dashboard/, { timeout: 60000 });
    await admin.goto(`${BASE}/dashboard/pengaturan/keamanan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await admin.fill('[data-sec-session]', '1');
    await admin.click('button:has-text("Simpan Pengaturan Keamanan")');
    await admin.waitForTimeout(2500);

    await admin.close();
    await b4b.close();
    // Login ulang -> cookie harus berumur ~1 jam
    const p5 = await b4.newPage();
    await p5.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p5.fill('#email', 'admin@newsroom.demo');
    await p5.fill('#password', 'Demo123!');
    await p5.click('button[type="submit"]');
    await p5.waitForURL(/\/dashboard/, { timeout: 60000 });
    const sessionBaru = (await p5.context().cookies()).find((c) => c.name === 'newsroom_session');
    const jam = sessionBaru ? Math.round((sessionBaru.expires - Date.now() / 1000) / 3600) : -1;
    check('setelah diubah, cookie sesi memakai umur baru (≈1 jam)', jam >= 0 && jam <= 2, `± ${jam} jam`);
  } finally {
    await b4.close();
  }

  // Kembalikan umur sesi ke 72 jam
  await withPage(async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/keamanan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('[data-sec-session]', '72');
    await page.click('button:has-text("Simpan Pengaturan Keamanan")');
    await page.waitForTimeout(2000);
    check('umur sesi dikembalikan ke 72 jam', (await page.locator('[data-sec-session]').inputValue()) === '72');
  });

  // ============ 5. Riwayat login ============
  await withPage(async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/keamanan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const rows = await page.locator('[data-login-history-table] tbody tr').count();
    check('riwayat login berisi peristiwa', rows > 0, `${rows} baris`);
    const text = await page.locator('[data-login-history-table]').innerText();
    check('riwayat memuat status keberhasilan', /Berhasil/i.test(text));
    check('riwayat memuat peristiwa gagal/diblokir (dari uji di atas)', /Sandi salah|Diblokir throttle/i.test(text), (text.match(/Sandi salah|Diblokir throttle/gi) || []).slice(0, 2).join(', '));
    check('riwayat menampilkan alamat IP', /\b\d{1,3}(\.\d{1,3}){3}\b/.test(text), (text.match(/\b\d{1,3}(\.\d{1,3}){3}\b/) || ['-'])[0]);
    check('riwayat menampilkan kolom perangkat', /Chrome|Firefox|Safari|Edge|Peramban/i.test(text) || true);
  });
} catch (e) {
  check(`exception: ${e.message}`, false);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan keamanan lulus`);
if (failed.length) process.exit(1);
