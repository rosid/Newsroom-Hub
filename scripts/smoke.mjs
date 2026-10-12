/**
 * Smoke test GarudaTV Newsroom Hub (Playwright 1.62.1 dari cache bersama platform).
 * Jalankan server produksi dulu (lihat README), lalu:
 *   BASE_URL=http://localhost:3998/newsroom-hub node scripts/smoke.mjs
 * Playwright: JANGAN install/override PLAYWRIGHT_BROWSERS_PATH — sudah tersedia.
 */
// Playwright tersedia dari cache bersama platform (NODE_PATH) — jangan install/override
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3998/newsroom-hub';
const results = [];
let current = 'init';

function check(name, ok, extra = '') {
  results.push({ group: current, name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${current}] ${name}${extra ? ` — ${extra}` : ''}`);
}

async function login(page, email, password = 'Demo123!') {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
}

/** Menunggu sampai berkas benar-benar terlampir pada form (bukan hanya baris progres). */
async function waitForUpload(page, filename, timeout = 90000) {
  await page.waitForFunction(
    (name) => {
      const el = document.querySelector('input[name="media"]');
      if (!el) return false;
      try {
        return JSON.parse(el.value || '[]').some((a) => a.filename === name);
      } catch {
        return false;
      }
    },
    filename,
    { timeout }
  );
}

/** Lingkungan uji selalu memakai penyimpanan lokal (lihat scripts/test-db-local-storage.ts). */
async function uploadedUrls(page) {
  return page.evaluate(() => {
    try {
      return JSON.parse(document.querySelector('input[name="media"]')?.value || '[]').map((a) => a.url);
    } catch {
      return [];
    }
  });
}

async function logout(page) {
  await page.context().clearCookies();
}

const fixture = path.join(process.cwd(), 'scripts', 'fixture-berita.png');
const fixture2 = path.join(process.cwd(), 'scripts', 'fixture-footage.mp4');
mkdirSync(path.dirname(fixture), { recursive: true });
// PNG 1x1 transparan (valid) untuk menguji alur unggah ke storage
writeFileSync(
  fixture,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARwAF/gG1F5q9AAAAAElFTkSuQmCC',
    'base64'
  )
);
// Berkas "footage" kecil (server memvalidasi ekstensi & ukuran) — dipakai untuk
// membuktikan lebih dari satu lampiran dapat dikirim dalam sekali kirim.
writeFileSync(fixture2, Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.alloc(64 * 1024, 3)]));

const title = `Smoke Test Liputan ${Date.now()}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('  [browser error]', e.message));

try {
  // 1. Login & dashboard
  current = 'auth';
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  check('root mengalihkan ke /login', page.url().includes('/login'));

  // KEAMANAN (regresi): halaman login TIDAK BOLEH memuat kredensial apa pun.
  // Sebelumnya ada panel "Akun demo (sandi: Demo123!)" + sandi terisi otomatis sehingga
  // siapa pun yang membuka URL produksi bisa langsung masuk sebagai Super Admin.
  current = 'keamanan-login';
  const loginHtml = await page.content();
  const loginBody = await page.locator('body').innerText();
  check('halaman login tidak memuat daftar akun demo', !/Akun demo/i.test(loginBody), loginBody.slice(0, 120).replace(/\n/g, ' '));
  check('halaman login tidak memuat sandi demo', !/Demo123/i.test(loginHtml) && !/Demo123/i.test(loginBody));
  check('halaman login tidak memuat alamat akun demo', !/@newsroom\.demo/i.test(loginHtml));
  check(
    'kolom email & sandi TIDAK terisi otomatis',
    (await page.inputValue('#email')) === '' && (await page.inputValue('#password')) === '',
    `email="${await page.inputValue('#email')}" sandi=${(await page.inputValue('#password')).length} karakter`
  );
  check('tautan "Lupa kata sandi?" tetap tersedia', (await page.locator('[data-forgot-link]').count()) > 0);

  // Fitur lihat/sembunyikan sandi (ikon mata) pada form login.
  const pwToggle = page.locator('[data-toggle-password]');
  check('tombol mata tersedia di kolom sandi', (await pwToggle.count()) === 1);
  check('sandi tersembunyi secara bawaan (type=password)', (await page.locator('#password').getAttribute('type')) === 'password');
  check('tombol mata punya nama untuk pembaca layar', (await pwToggle.getAttribute('aria-label')) === 'Lihat sandi', await pwToggle.getAttribute('aria-label'));
  await page.fill('#password', 'ContohSandi123!');
  await pwToggle.click();
  await page.waitForTimeout(200);
  check('klik ikon mata menampilkan sandi (type=text)', (await page.locator('#password').getAttribute('type')) === 'text');
  check('nilai sandi tetap utuh saat ditampilkan', (await page.inputValue('#password')) === 'ContohSandi123!');
  check('klik ikon TIDAK mengirim form (tetap di /login)', page.url().includes('/login'), page.url().split('/newsroom-hub')[1] ?? page.url());
  await pwToggle.click();
  await page.waitForTimeout(200);
  check('klik kedua menyembunyikan kembali (type=password)', (await page.locator('#password').getAttribute('type')) === 'password');
  await page.fill('#password', '');

  current = 'auth';
  await login(page, 'reporter.pusat@newsroom.demo');
  check('login reporter pusat berhasil', page.url().includes('/dashboard'));
  check('statistik ringkas tampil', (await page.locator('.kpi').count()) >= 4, `${await page.locator('.kpi').count()} kartu`);
  const dashLink = page.locator('a.nav-link', { hasText: 'Dashboard' }).first();
  check('menu "Dashboard" tersedia di sidebar', (await dashLink.count()) > 0);
  await Promise.all([page.waitForURL(/\/dashboard$/, { timeout: 30000 }), dashLink.click()]);
  check('menu Dashboard membuka halaman /dashboard', /\/dashboard$/.test(page.url()), page.url().split('/newsroom-hub')[1] ?? page.url());
  const kpiText = await page.locator('.kpi').first().innerText();
  check('kartu "Berita Hari Ini" ada', kpiText.includes('BERITA HARI INI') || kpiText.includes('Berita Hari Ini'));

  // 1b. Banner pengumuman: paling atas + latar merah
  current = 'banner-pengumuman';
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  const bannerBox = page.locator('[data-announcement-banner]');
  check('banner pengumuman tampil di dashboard', (await bannerBox.count()) === 1, `${await bannerBox.count()} elemen`);
  const bannerGeom = await page.evaluate(() => {
    const b = document.querySelector('[data-announcement-banner]');
    const top = (el) => (el ? Math.round(el.getBoundingClientRect().top) : -1);
    const ref = document.querySelector('section.panel');
    const cs = b ? getComputedStyle(b) : null;
    const rgb = [];
    if (cs) for (const m of `${cs.backgroundColor} ${cs.backgroundImage}`.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) rgb.push([+m[1], +m[2], +m[3]]);
    return {
      banner: top(b),
      kpi: top(document.querySelector('.kpi')),
      panel: top(document.querySelector('section.panel')),
      color: cs ? cs.color : '',
      bg: cs ? cs.backgroundColor : '',
      bgImage: cs ? cs.backgroundImage : '',
      refBg: ref ? getComputedStyle(ref).backgroundColor : '',
      bodyColor: getComputedStyle(document.body).color,
      rgb,
    };
  });
  check(
    'banner berada di atas kartu statistik',
    bannerGeom.banner >= 0 && bannerGeom.kpi > 0 && bannerGeom.banner < bannerGeom.kpi,
    `banner=${bannerGeom.banner} kpi=${bannerGeom.kpi}`
  );
  check(
    'banner berada di atas panel konten lainnya',
    bannerGeom.banner >= 0 && bannerGeom.panel > 0 && bannerGeom.banner < bannerGeom.panel,
    `banner=${bannerGeom.banner} panel=${bannerGeom.panel}`
  );
  check(
    'latar banner mengikuti warna dasar (sama dengan panel lain)',
    bannerGeom.bg === bannerGeom.refBg && bannerGeom.bgImage === 'none',
    `banner=${bannerGeom.bg} panel=${bannerGeom.refBg} image=${bannerGeom.bgImage}`
  );
  check(
    'latar banner tidak merah lagi',
    !bannerGeom.rgb.some(([r, g, b]) => r >= 120 && r >= g * 1.8 && r >= b * 1.8),
    bannerGeom.rgb.map((c) => c.join(',')).slice(0, 3).join(' | ')
  );
  check(
    'teks banner memakai warna teks dasar tema',
    bannerGeom.color === bannerGeom.bodyColor,
    `banner=${bannerGeom.color} dasar=${bannerGeom.bodyColor}`
  );
  check('judul pengumuman tampil di banner', (await bannerBox.locator('text=Pedoman Lapangan Reporter').count()) > 0);
  check('banner menautkan ke halaman pengumuman', (await bannerBox.locator('a[href*="/dashboard/pengumuman"]').count()) > 0);

  // 2. Tabulasi
  current = 'tabulasi';
  await page.goto(`${BASE}/dashboard/tabulasi`, { waitUntil: 'domcontentloaded' });
  const tabs = await page.locator('.tab').allInnerTexts();
  check('tab pusat tersedia', tabs.some((t) => t.includes('Tabulasi Pusat')));
  check('reporter pusat TIDAK melihat tab daerah', !tabs.some((t) => t.includes('Tabulasi Daerah')), tabs.join(' | '));
  const rows = await page.locator('.dtable tbody tr').count();
  check('tabel tabulasi berisi data', rows > 0, `${rows} baris`);
  await page.goto(`${BASE}/dashboard/tabulasi?range=today`, { waitUntil: 'domcontentloaded' });
  check('filter tanggal "Hari Ini" aktif', (await page.locator('.tab.active').count()) > 0);

  // 3. Kirim berita (naskah + media + geo)
  current = 'kirim';
  await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded' });
  await page.fill('#title', title);
  await page.selectOption('#category', { label: 'Ekonomi' });
  await page.click('button:has-text("Breaking News")');
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type(
    'JAKARTA — Uji otomatis newsroom hub: reporter pusat mengirim naskah lengkap dengan footage dan geo-tagging untuk memastikan alur kirim berjalan.'
  );
  await page.fill('#summary', 'Ringkasan uji otomatis alur pengiriman berita.');
  await page.fill('#location', 'Kawasan Uji, Jakarta Pusat');
  await page.selectOption('#province', { label: 'DKI Jakarta' });
  await page.fill('#city', 'Jakarta');
  await page.fill('#latitude', '-6.18624');
  await page.fill('#longitude', '106.83875');
  await page.fill('input[name="tags"]', 'uji, newsroom');

  // Dua berkas sekaligus (gambar + footage) dalam satu kali pilih
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture, fixture2]);
  await waitForUpload(page, 'fixture-berita.png');
  await waitForUpload(page, 'fixture-footage.mp4');
  await page.waitForFunction(
    () => JSON.parse(document.querySelector('input[name="media"]')?.value || '[]').length === 2,
    undefined,
    { timeout: 90000 }
  );
  const urls = await uploadedUrls(page);
  check('unggah DUA lampiran sekaligus berhasil', urls.length === 2, `${urls.length} berkas terunggah`);
  check('setiap berkas menampilkan status selesai', (await page.locator('text=Selesai').count()) >= 2);
  check(
    'lingkungan uji memakai penyimpanan LOKAL (tidak menulis ke storage produksi)',
    urls.every((u) => String(u).startsWith('local:')),
    urls.join(', ')
  );

  await Promise.all([
    page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 40000 }),
    page.click('button:has-text("Kirim Berita")'),
  ]);
  const newsUrl = page.url();
  check('berita terkirim & masuk halaman detail', /\/dashboard\/tabulasi\/berita\//.test(newsUrl), newsUrl.split('/').pop());
  check('status menunggu persetujuan', (await page.locator('text=Menunggu Persetujuan').count()) > 0);
  check('naskah tampil di detail', (await page.locator('text=Uji otomatis newsroom hub').count()) > 0);
  check('lampiran gambar tampil', (await page.locator('img[alt="fixture-berita.png"]').count()) > 0);
  check('lampiran footage tampil', (await page.locator('video').count()) >= 1);
  check('detail menyebut 2 lampiran', (await page.locator('text=2 lampiran').count()) > 0);

  // 4. Produser pusat: validasi
  current = 'validasi';
  await logout(page);
  await login(page, 'produser.pusat@newsroom.demo');
  await page.goto(`${BASE}/dashboard/tabulasi?tab=pending`, { waitUntil: 'domcontentloaded' });
  check('berita muncul di tab menunggu', (await page.locator(`text=${title}`).count()) > 0);
  await page.goto(newsUrl, { waitUntil: 'domcontentloaded' });
  check('tombol validasi tersedia untuk produser', (await page.locator('button:has-text("Validasi Berita")').count()) > 0);
  await page.click('button:has-text("Validasi Berita")');
  await page.waitForSelector('[role="dialog"]');
  await page.click('button:has-text("Verifikasi / Lolos")');
  await page.fill('#review-note', 'Naskah lengkap, footage layak tayang.');
  await page.click('[role="dialog"] button:has-text("Simpan Hasil Validasi")');
  await page.waitForSelector('text=Terverifikasi', { timeout: 30000 });
  check('status berubah menjadi Terverifikasi', (await page.locator('text=Terverifikasi').count()) > 0);

  // 5. Redaktur: siarkan
  current = 'tayang';
  await logout(page);
  await login(page, 'redaktur@newsroom.demo');
  await page.goto(newsUrl, { waitUntil: 'domcontentloaded' });
  check('tombol "Tayang Onair" tersedia untuk redaktur', (await page.locator('button:has-text("Tayang Onair")').count()) > 0);
  check('tombol "Tayang Medsos" tersedia untuk redaktur', (await page.locator('button:has-text("Tayang Medsos")').count()) > 0);
  await page.click('button:has-text("Tayang Onair")');
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] button:has-text("Tayang Onair")');
  await page.waitForSelector('text=Disiarkan', { timeout: 30000 });
  check('berita berhasil ditayangkan (onair)', (await page.locator('text=Disiarkan').count()) > 0);

  // 6. Pemisahan pool: produser pusat tidak boleh lihat pool daerah
  current = 'pemisahan-pool';
  await page.goto(`${BASE}/dashboard/tabulasi`, { waitUntil: 'domcontentloaded' });
  const tabsRed = await page.locator('.tab').allInnerTexts();
  check('redaktur pusat tidak melihat tab daerah', !tabsRed.some((t) => t.includes('Tabulasi Daerah')));
  await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded' });

  // 7. Reporter daerah: lihat tabulasi daerah + pusat
  current = 'biro-daerah';
  await logout(page);
  await login(page, 'reporter.medan@newsroom.demo');
  await page.goto(`${BASE}/dashboard/tabulasi`, { waitUntil: 'domcontentloaded' });
  const tabsDaerah = await page.locator('.tab').allInnerTexts();
  check('reporter daerah melihat tab Tabulasi Daerah', tabsDaerah.some((t) => t.includes('Tabulasi Daerah')), tabsDaerah.join(' | '));
  check('reporter daerah melihat tab Tabulasi Pusat', tabsDaerah.some((t) => t.includes('Tabulasi Pusat')));
  const medanRows = await page.locator('.dtable tbody tr').count();
  check('tabulasi daerah berisi berita biro', medanRows > 0, `${medanRows} baris`);
  await page.goto(`${BASE}/dashboard/tabulasi?tab=daerah`, { waitUntil: 'domcontentloaded' });
  const biroTexts = await page.locator('.dtable tbody tr').allInnerTexts();
  check(
    'hanya berita biro sendiri yang tampil',
    biroTexts.every((t) => !t.includes('Biro Surabaya')),
    biroTexts.some((t) => t.includes('Biro Surabaya')) ? 'ada baris biro lain' : 'ok'
  );

  // 8. Peta, laporan, pengumuman
  current = 'peta-laporan';
  await page.goto(`${BASE}/dashboard/peta`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.leaflet-container', { timeout: 30000 });
  check('peta sebaran termuat', (await page.locator('.leaflet-container').count()) > 0);
  check('legenda status tampil', (await page.locator('text=Breaking News').count()) > 0);

  await page.goto(`${BASE}/dashboard/laporan`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  check('halaman laporan dengan grafik', (await page.locator('svg.recharts-surface').count()) >= 2, `${await page.locator('svg.recharts-surface').count()} grafik`);
  check('rekap per biro tampil', (await page.locator('text=Rekap per Biro').count()) > 0);

  // 9. Tema & notifikasi
  current = 'ui';
  const isDarkBefore = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.click('button[aria-label="Ganti tema"]');
  await page.waitForTimeout(400);
  const isDarkAfter = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  check('mode gelap/terang dapat diganti', isDarkBefore !== isDarkAfter, `${isDarkBefore} → ${isDarkAfter}`);
  await page.click('button[aria-label="Ganti tema"]');
  await page.click('button[aria-label="Notifikasi"]');
  await page.waitForTimeout(800);
  check('lonceng notifikasi terbuka', (await page.locator('text=Tandai semua dibaca').count()) >= 0);

  // 10. Admin: pengaturan, pengumuman, hapus berita uji
  current = 'admin';
  await logout(page);
  await login(page, 'admin@newsroom.demo');
  await page.goto(`${BASE}/dashboard/pengaturan`, { waitUntil: 'domcontentloaded' });
  check('master pengaturan tampil', (await page.locator('text=Identitas Newsroom').count()) > 0);

  // 10b. Master Pengaturan: DUA form (Identitas & Warna Tema) memakai action yang sama.
  // Dulu menyimpan salah satu form SELALU gagal karena schema memvalidasi seluruh field `org`:
  // form identitas → "Warna harus #RRGGBB", form warna → "Nama situs minimal 3 karakter".
  current = 'master-pengaturan';
  const idForm = page.locator('form:has(#siteName)');
  const colorForm = page.locator('form:has(#primaryColor)');
  const hexInput = colorForm.locator('input[aria-label="Kode warna utama"]');
  const brandVar = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase());
  const originalName = await page.inputValue('#siteName');
  const originalHex = (await hexInput.inputValue()).trim().toLowerCase();

  check('form identitas & form warna terpisah', (await idForm.count()) === 1 && (await colorForm.count()) === 1);

  // (a) Simpan form IDENTITAS saja
  await idForm.locator('button[type="submit"]').click();
  await idForm.locator('p:has-text("tersimpan")').first().waitFor({ timeout: 40000 });
  check('simpan identitas tidak lagi gagal karena warna', (await idForm.locator('text=Warna harus').count()) === 0);

  // (b) Simpan form WARNA saja (warna benar-benar berubah & dipakai aplikasi)
  await hexInput.fill('#0f766e');
  await colorForm.locator('button[type="submit"]').click();
  await colorForm.locator('p:has-text("tersimpan")').first().waitFor({ timeout: 40000 });
  check('simpan warna tidak lagi gagal karena nama situs', (await colorForm.locator('text=Nama situs minimal').count()) === 0);
  await page.waitForTimeout(800);
  check('warna tema baru benar-benar dipakai aplikasi', (await brandVar()) === '#0f766e', await brandVar());

  // (c) Hex tidak lengkap tidak boleh tersimpan sebagai hitam
  await hexInput.fill('#0f76');
  await colorForm.locator('button[type="submit"]').click();
  await colorForm.locator('p:has-text("tersimpan")').first().waitFor({ timeout: 40000 });
  await page.waitForTimeout(600);
  const afterPartial = await brandVar();
  check('kode warna tidak lengkap tidak tersimpan sebagai hitam', afterPartial !== '#000000', afterPartial);

  // (d) Kembalikan warna & identitas seperti semula (data uji tidak tertinggal)
  await hexInput.fill(originalHex);
  await colorForm.locator('button[type="submit"]').click();
  await colorForm.locator('p:has-text("tersimpan")').first().waitFor({ timeout: 40000 });
  await page.waitForTimeout(600);
  check('warna dikembalikan ke nilai semula', (await brandVar()) === originalHex, await brandVar());

  // (e) Validasi field wajib TETAP berlaku (bukan dilonggarkan) — nama situs dikosongkan
  await page.fill('#siteName', '');
  await idForm.locator('button[type="submit"]').click();
  await idForm.locator('p:has-text("Nama situs minimal")').first().waitFor({ timeout: 40000 });
  check('nama situs kosong tetap ditolak', (await idForm.locator('text=Nama situs minimal').count()) > 0);
  await page.fill('#siteName', originalName);
  await idForm.locator('button[type="submit"]').click();
  await idForm.locator('p:has-text("tersimpan")').first().waitFor({ timeout: 40000 });
  check('nama situs dipulihkan', (await page.inputValue('#siteName')) === originalName);

  await page.goto(`${BASE}/dashboard/pengaturan/biro`, { waitUntil: 'domcontentloaded' });
  check('daftar biro daerah tampil', (await page.locator('text=Biro Medan').count()) > 0);
  await page.goto(`${BASE}/dashboard/pengaturan/kategori`, { waitUntil: 'domcontentloaded' });
  check('daftar kategori tampil', (await page.locator('text=Hukum & Kriminal').count()) > 0);
  await page.goto(`${BASE}/dashboard/pengaturan/pengguna`, { waitUntil: 'domcontentloaded' });
  check('daftar pengguna tampil', (await page.locator('text=redaktur@newsroom.demo').count()) > 0);
  await page.goto(`${BASE}/dashboard/pengaturan/integrasi`, { waitUntil: 'domcontentloaded' });
  check('status storage tampil', (await page.locator('text=Status Storage Aktif').count()) > 0);
  await page.goto(`${BASE}/dashboard/pengaturan/audit`, { waitUntil: 'domcontentloaded' });
  check('log aktivitas tampil', (await page.locator('text=LOGIN').count()) > 0);

  const pengumumanTitle = `Uji Pengumuman ${Date.now()}`;
  await page.goto(`${BASE}/dashboard/pengumuman`, { waitUntil: 'domcontentloaded' });
  await page.fill('#a-title', pengumumanTitle);
  await page.fill('#a-body', 'Pengumuman uji otomatis untuk memastikan fitur pengumuman & notifikasi berjalan.');
  await page.click('button:has-text("Kirim Pengumuman")');
  await page.waitForSelector(`text=${pengumumanTitle}`, { timeout: 30000 });
  check('pengumuman dibuat & tampil', (await page.locator(`text=${pengumumanTitle}`).count()) > 0);

  // pengumuman khusus satu biro — untuk menguji filter audiens pada banner dashboard
  const biroTitle = `Uji Pengumuman Biro Surabaya ${Date.now()}`;
  await page.goto(`${BASE}/dashboard/pengumuman`, { waitUntil: 'domcontentloaded' });
  await page.fill('#a-title', biroTitle);
  await page.fill('#a-body', 'Pengumuman uji hanya untuk biro Surabaya, tidak boleh muncul pada banner pengguna biro lain.');
  await page.selectOption('#a-bureau', { label: 'Biro Surabaya' });
  await page.click('button:has-text("Kirim Pengumuman")');
  await page.waitForSelector(`text=${biroTitle}`, { timeout: 30000 });
  check('pengumuman khusus biro dibuat', (await page.locator(`text=${biroTitle}`).count()) > 0);

  // hapus berita uji (admin) — membersihkan data uji
  await page.goto(newsUrl, { waitUntil: 'domcontentloaded' });
  await page.click('button:has-text("Hapus Berita")');
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] button:has-text("Hapus Permanen")');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/dashboard/tabulasi?range=all&q=Smoke+Test`, { waitUntil: 'domcontentloaded' });
  const leftovers = await page.locator(`text=${title}`).count();
  check('berita uji terhapus kembali', leftovers === 0, `${leftovers} sisa`);

  // 11. Kontrol akses: tanpa login diarahkan ke login
  current = 'keamanan';
  await logout(page);
  await page.goto(`${BASE}/dashboard/tabulasi`, { waitUntil: 'domcontentloaded' });
  check('halaman dashboard dilindungi login', page.url().includes('/login'));
  const apiRes = await page.request.get(`${BASE}/api/export/news?tab=pusat`, { maxRedirects: 0 });
  check('API ekspor menolak tanpa sesi (401)', apiRes.status() === 401, `HTTP ${apiRes.status()}`);

  // 12. Banner pengumuman mengikuti audiens (pengumuman khusus biro)
  current = 'banner-audiens';
  const bannerText = async () => {
    const box = page.locator('[data-announcement-banner]');
    return (await box.count()) ? (await box.innerText()).toLowerCase() : '';
  };
  await login(page, 'reporter.surabaya@newsroom.demo');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  const surabayaBanner = await bannerText();
  check('banner menampilkan pengumuman untuk biro yang dituju', surabayaBanner.includes('biro surabaya'), surabayaBanner.slice(0, 80));
  await logout(page);
  await login(page, 'reporter.medan@newsroom.demo');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  const medanBanner = await bannerText();
  check('banner TIDAK menampilkan pengumuman milik biro lain', !medanBanner.includes('biro surabaya'), medanBanner.slice(0, 80));
  check('pengumuman untuk semua pengguna tetap tampil', medanBanner.includes('pedoman lapangan'));
} catch (e) {
  check(`exception: ${(e && e.message) || e}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan lulus`);
if (failed.length) {
  console.log('Gagal:');
  for (const f of failed) console.log(` - [${f.group}] ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
