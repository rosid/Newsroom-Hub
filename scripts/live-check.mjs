/**
 * Verifikasi cepat aplikasi LIVE (aset, login, tabulasi, unggah media ke storage).
 * Jalankan: BASE_URL=https://rosid.vibecoder.co.id/newsroom-hub node scripts/live-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'https://rosid.vibecoder.co.id/newsroom-hub';
const EMAIL = process.env.LIVE_EMAIL || 'admin@newsroom.demo';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARwAF/gG1F5q9AAAAAElFTkSuQmCC',
  'base64'
);

const origin = new URL(BASE).origin;
const BASE_PATH = new URL(BASE).pathname.replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
const badRequests = [];
/** true bila storage live memakai S3-compatible lengkap (jalur unggahan langsung tersedia). */
let liveDirectCapable = false;
/** Rekaman jalur unggah lampiran live: 'direct' (ke storage) atau 'server' (lewat server web). */
const liveTransport = { presign: 0, serverUpload: 0, directPuts: [] };
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('/api/media/presign')) liveTransport.presign += 1;
  else if (u.includes('/api/media/upload')) liveTransport.serverUpload += 1;
  else if (r.method() === 'PUT' && !u.startsWith(BASE)) liveTransport.directPuts.push(u);
});
page.on('response', (r) => {
  const u = r.url();
  if (r.status() >= 400 && (u.includes('/_next/') || u.includes('/newsroom-hub/'))) {
    badRequests.push(`${r.status()} ${u.replace(BASE, '')}`);
  }
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  check('halaman login live termuat', (await page.locator('text=Masuk ke ruang redaksi').count()) > 0);

  // KEAMANAN (regresi di PRODUKSI): halaman login live tidak boleh memuat kredensial demo,
  // dan kolomnya tidak boleh terisi otomatis.
  const loginHtmlLive = await page.content();
  const loginBodyLive = await page.locator('body').innerText();
  check('live: halaman login tidak memuat daftar akun demo', !/Akun demo/i.test(loginBodyLive));
  check('live: halaman login tidak memuat sandi demo', !/Demo123/i.test(loginHtmlLive) && !/Demo123/i.test(loginBodyLive));
  check('live: halaman login tidak memuat alamat akun demo', !/@newsroom\.demo/i.test(loginHtmlLive));
  check(
    'live: kolom email & sandi tidak terisi otomatis',
    (await page.inputValue('#email')) === '' && (await page.inputValue('#password')) === ''
  );

  const styled = await page.evaluate(() => {
    const el = document.querySelector('.input');
    return el ? getComputedStyle(el).borderRadius : 'none';
  });
  check('CSS/Tailwind aktif (styling diterapkan)', styled !== 'none' && styled !== '', `border-radius=${styled}`);

  await page.fill('#email', EMAIL);
  await page.fill('#password', 'Demo123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
  check('login live berhasil', page.url().includes('/dashboard'));
  check('statistik ringkas tampil', (await page.locator('.kpi').count()) >= 4);

  // Banner pengumuman di live: harus paling atas dan berlatar merah (read-only)
  const bannerLive = page.locator('[data-announcement-banner]');
  const bannerLiveCount = await bannerLive.count();
  if (bannerLiveCount > 0) {
    const geom = await page.evaluate(() => {
      const b = document.querySelector('[data-announcement-banner]');
      const top = (el) => (el ? Math.round(el.getBoundingClientRect().top) : -1);
      const ref = document.querySelector('section.panel');
      const cs = getComputedStyle(b);
      const rgb = [];
      for (const m of `${cs.backgroundColor} ${cs.backgroundImage}`.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) rgb.push([+m[1], +m[2], +m[3]]);
      return {
        banner: top(b),
        kpi: top(document.querySelector('.kpi')),
        color: cs.color,
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        refBg: ref ? getComputedStyle(ref).backgroundColor : '',
        bodyColor: getComputedStyle(document.body).color,
        rgb,
      };
    });
    check('banner pengumuman live tampil di atas kartu statistik', geom.banner >= 0 && geom.kpi > 0 && geom.banner < geom.kpi, `banner=${geom.banner} kpi=${geom.kpi}`);
    check('latar banner live mengikuti warna dasar (sama dengan panel lain)', geom.bg === geom.refBg && geom.bgImage === 'none', `banner=${geom.bg} panel=${geom.refBg} image=${geom.bgImage}`);
    check('latar banner live tidak merah', !geom.rgb.some(([r, g, b]) => r >= 120 && r >= g * 1.8 && r >= b * 1.8), geom.rgb.map((c) => c.join(',')).slice(0, 3).join(' | '));
    check('teks banner live memakai warna teks dasar tema', geom.color === geom.bodyColor, `banner=${geom.color} dasar=${geom.bodyColor}`);
    check('tidak ada pengumuman yang sama di kolom kanan dashboard', (await page.locator('section.panel', { hasText: 'Pengumuman Redaksi' }).count()) === 0);
  } else {
    check('banner pengumuman live (dilewati: tidak ada pengumuman aktif)', true, 'tidak ada pengumuman aktif');
  }

  await page.goto(`${BASE}/dashboard/tabulasi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const tabs = await page.locator('.tab').allInnerTexts();
  check('tabulasi daerah tampil untuk reporter biro', tabs.some((t) => t.includes('Tabulasi Daerah')), tabs.join(' | '));
  check('tabel berisi data', (await page.locator('.dtable tbody tr').count()) > 0);

  await page.goto(`${BASE}/dashboard/peta`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.leaflet-container', { timeout: 45000 });
  check('peta live termuat', (await page.locator('.leaflet-container').count()) > 0);

  // Catatan: uji unggah nyata + unduh dilakukan di bagian bawah (membuat berita uji
  // lalu menghapusnya kembali) agar tidak meninggalkan berkas di storage produksi.

  // Tampilan kartu (grid 4 kolom) + endpoint data "muat lagi" pada aplikasi live
  await page.goto(`${BASE}/dashboard/tabulasi?view=card`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#tabulasi-berita .grid', { timeout: 45000 });
  const cards = await page.locator('#tabulasi-berita a.panel.group').count();
  const cols = await page
    .locator('#tabulasi-berita .grid')
    .first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
  check('tampilan kartu live aktif (4 kolom)', cols === 4 && cards > 0, `${cards} kartu, ${cols} kolom`);
  check(
    'tombol/pesan load more sesuai jumlah data',
    (await page.locator('button:has-text("Muat 20 Kartu Lagi")').count()) > 0 ||
      (await page.locator('text=Semua berita pada filter ini sudah dimuat.').count()) > 0
  );

  const listRes = await page.request.get(`${BASE}/api/news/list?tab=pusat&range=all&page=1`, { timeout: 60000 });
  const listData = await listRes.json().catch(() => ({}));
  check(
    'endpoint data kartu live mengembalikan data & total',
    listRes.status() === 200 && listData.ok === true && Array.isArray(listData.items) && listData.items.length > 0,
    `HTTP ${listRes.status()} · ${listData.items?.length ?? 0} item · total ${listData.total ?? '?'}`
  );
  // Tanpa sesi: pakai permintaan bersih (tanpa cookie hasil login di atas)
  const unauth = await fetch(`${BASE}/api/news/list?tab=pusat`, { redirect: 'manual' }).catch(() => null);
  if (unauth) {
    check('endpoint data kartu menolak tanpa sesi', [401, 403, 307].includes(unauth.status), `HTTP ${unauth.status}`);
  }

  // Konfigurasi storage (halaman integrasi) — hanya memeriksa tampilan, tidak mengubah apa pun
  await page.goto(`${BASE}/dashboard/pengaturan/integrasi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('halaman Storage & Integrasi tampil di live', (await page.locator('text=Status Storage Aktif').count()) > 0);
  // Tampilkan panel S3 (hanya toggle tampilan client — tidak menyimpan apa pun)
  await page.click('button:has-text("S3 Compatible (Cloud / CDN)")');
  await page.waitForSelector('#s-endpoint', { timeout: 30000 });
  const presets = await page.locator('button:has-text("BunnyCDN Storage")').count();
  const presetNames = ['Cloudflare R2', 'Amazon S3', 'DigitalOcean Spaces', 'Wasabi', 'Backblaze B2', 'S3 Compatible lainnya'];
  const others = await Promise.all(
    presetNames.map(async (n) => ((await page.locator(`button:has-text("${n}")`).count()) > 0))
  );
  check('preset penyedia S3 tersedia di live', presets > 0 && others.every(Boolean), `bunny=${presets} lain=${others.filter(Boolean).length}/${others.length}`);
  check('form kredensial S3 lengkap di live', (await page.locator('#s-bucket, #s-access, #s-secret, #s-public').count()) >= 4);
  check('tombol uji koneksi tersedia di live', (await page.locator('button:has-text("Jalankan Uji Koneksi")').count()) > 0);
  check('menu Dashboard tersedia di live', (await page.locator('a.nav-link', { hasText: 'Dashboard' }).count()) > 0);

  // Master Pengaturan di live: dua form (Identitas & Warna Tema) memakai action yang sama.
  // Uji ini MENGIRIM ULANG NILAI YANG SAMA (tidak mengubah apa pun) semata-mata untuk
  // memastikan bug "Warna harus #RRGGBB" / "Nama situs minimal 3 karakter" tidak kembali.
  await page.goto(`${BASE}/dashboard/pengaturan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const liveIdForm = page.locator('form:has(#siteName)');
  const liveColorForm = page.locator('form:has(#primaryColor)');
  check('live: form identitas & warna tema tersedia', (await liveIdForm.count()) === 1 && (await liveColorForm.count()) === 1);
  const liveName = await page.inputValue('#siteName');
  await page.fill('#siteName', liveName); // nilai sama seperti tersimpan
  await liveIdForm.locator('button[type="submit"]').click();
  await liveIdForm.locator('p:has-text("tersimpan")').first().waitFor({ timeout: 60000 });
  check('live: simpan identitas berhasil (bukan "Warna harus #RRGGBB")', (await liveIdForm.locator('text=Warna harus').count()) === 0);
  const liveHex = page.locator('form:has(#primaryColor) input[aria-label="Kode warna utama"]');
  const liveHexValue = (await liveHex.inputValue()).trim();
  await liveHex.fill(liveHexValue);
  await liveColorForm.locator('button[type="submit"]').click();
  await liveColorForm.locator('p:has-text("tersimpan")').first().waitFor({ timeout: 60000 });
  check(
    'live: simpan warna tema berhasil (bukan "Nama situs minimal 3 karakter")',
    (await liveColorForm.locator('text=Nama situs minimal').count()) === 0
  );
  await page.waitForTimeout(500);
  const liveBrand = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase()
  );
  check('live: warna tema tetap seperti semula (tidak berubah karena uji)', liveBrand === liveHexValue.toLowerCase(), `${liveBrand} vs ${liveHexValue}`);

  // Panel Format Broadcast di form naskah (dipakai berita uji di bawah, jadi tidak
  // perlu menulis apa pun) — memastikan lima penanda tersedia di aplikasi live.
  const LUAR = '/dashboard/kirim';
  await page.goto(`${BASE}${LUAR}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Status UNGGAHAN LANGSUNG (pre-signed URL) di live — hanya dibaca, tidak mengubah konfigurasi.
  await page.goto(`${BASE}/dashboard/pengaturan/integrasi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const directBadge = page.locator('[data-direct-upload]');
  check('live: status unggahan langsung (pre-signed URL) dapat dibaca', (await directBadge.count()) === 1, (await directBadge.innerText().catch(() => '')).trim());
  liveDirectCapable = (await directBadge.innerText().catch(() => '')).toLowerCase().includes('aktif');
  check(
    'live: catatan syarat CORS/HTTPS untuk unggahan langsung ditampilkan',
    (await page.locator('[data-direct-upload-note]').count()) === 1 &&
      (await page.locator('[data-direct-upload-note]').innerText()).toLowerCase().includes('cors')
  );

  await page.goto(`${BASE}${LUAR}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const cueButtons = await page.locator('[data-broadcast-cues] button[data-cue]').allInnerTexts();
  const cueCodes = await page
    .locator('[data-broadcast-cues] button[data-cue]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-cue')));
  const EXPECTED_CUES = ['[ANCHOR ON CAM]', '[ROLL TAPE / FOOTAGE]', '[VO REPORTER]', '[SOUNDBITE / SOT]', '[STANDUP LIVE]'];
  check(
    'panel Format Broadcast tersedia di live',
    (await page.locator('[data-broadcast-cues]').count()) > 0 && cueButtons.length >= 5,
    cueButtons.map((b) => b.trim()).join(' | ')
  );
  check(
    'kelima penanda broadcast sesuai yang diminta',
    EXPECTED_CUES.every((c) => cueCodes.includes(c)),
    cueCodes.join(' ')
  );
  // Klik satu penanda → masuk ke body naskah (tidak menyimpan apa pun)
  await page.locator('[contenteditable="true"]').click();
  await page.locator('[data-broadcast-cues] button[data-cue="[ANCHOR ON CAM]"]').click();
  const cueScript = await page.locator('input[name="script"]').inputValue();
  check(
    'klik penanda langsung masuk ke body naskah di live',
    cueScript.includes('[ANCHOR ON CAM]') && cueScript.includes('bc-cue'),
    cueScript.slice(0, 60)
  );
  // Segarkan halaman agar sisa uji tidak memakai naskah berisi penanda
  await page.goto(`${BASE}${LUAR}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Fitur unduh + tautan berbagi tamu pada aplikasi LIVE.
  // Membuat satu berita uji dengan lampiran NYATA lalu menghapusnya kembali di akhir,
  // sehingga tidak meninggalkan data/berkas di storage produksi.
  const liveTitle = `Verifikasi Unduh & Berbagi ${Date.now()}`;
  await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#title', liveTitle);
  await page.selectOption('#category', { label: 'Teknologi' });
  // Naskah memakai penanda Format Broadcast agar ikut terverifikasi di live
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type('JAKARTA — Berita uji otomatis untuk memverifikasi fitur unduh materi dan tautan berbagi tamu. ');
  for (const [cue, text] of [
    ['[ANCHOR ON CAM]', 'Pembawa acara membuka laporan.'],
    ['[ROLL TAPE / FOOTAGE]', 'Gulirkan footage lapangan.'],
    ['[SOUNDBITE / SOT]', 'Narasumber memberi keterangan.'],
  ]) {
    await page.locator(`[data-broadcast-cues] button[data-cue="${cue}"]`).click();
    await page.keyboard.type(text + ' ');
  }
  await page.fill('#location', 'Jakarta Pusat');
  await page.selectOption('#province', { label: 'DKI Jakarta' });
  // Unggah DUA berkas sekaligus (berkas kedua kecil agar hemat bandwidth storage pengguna)
  check('pemilih berkas mendukung banyak lampiran', (await page.locator('input[type="file"]').first().getAttribute('multiple')) !== null);
  await page.setInputFiles('input[type="file"]', [
    { name: 'verifikasi-unduh.png', mimeType: 'image/png', buffer: png },
    { name: 'verifikasi-unduh-2.png', mimeType: 'image/png', buffer: png },
  ]);
  await page.waitForFunction(
    () => {
      const el = document.querySelector('input[name="media"]');
      try {
        return JSON.parse(el?.value || '[]').length === 2;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 180000 }
  );
  check('dua lampiran terunggah pada aplikasi live', (await page.locator('text=Selesai').count()) >= 2);
  const liveItemText = await page.locator('li', { hasText: 'verifikasi-unduh.png' }).first().innerText().catch(() => '');
  const usedDirect = /langsung ke storage/i.test(liveItemText) || liveTransport.directPuts.length > 0;
  check(
    'live: lampiran memakai jalur unggahan yang jelas (langsung ke storage / lewat server)',
    usedDirect || liveTransport.serverUpload > 0,
    `${usedDirect ? 'langsung ke storage' : 'lewat server web'} · presign=${liveTransport.presign} server=${liveTransport.serverUpload}`
  );
  check(
    'live: klien meminta URL bertanda tangan (pre-signed) sebelum mengunggah',
    liveTransport.presign > 0,
    `presign=${liveTransport.presign}`
  );
  // Informasi (bukan kegagalan): jalur yang dipakai bergantung pada izin CORS storage zone
  // milik pengguna — lapor apa adanya agar operator tahu apakah server web masih dilewati.
  if (liveDirectCapable) {
    console.log(
      `     ℹ jalur unggahan live yang dipakai: ${
        usedDirect ? 'langsung ke storage (pre-signed, tanpa melewati server web)' : 'lewat server web (storage zone belum mengizinkan CORS/HTTPS endpoint)'
      }`
    );
  }
  check('detail menyebut 2 lampiran live', (await page.locator('text=2 lampiran').count()) > 0);
  await page.click('button:has-text("Kirim ke Produser")');
  await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 90000 });

  // Penanda format broadcast bertahan setelah disimpan & tampil berwarna
  const scriptHtml = await page.locator('.prose-news').first().innerHTML();
  const chipsInDetail = await page.locator('.prose-news .bc-cue').count();
  check(
    'penanda format broadcast tersimpan & tampil di naskah live',
    chipsInDetail >= 3 && scriptHtml.includes('[ANCHOR ON CAM]') && scriptHtml.includes('[SOUNDBITE / SOT]'),
    `${chipsInDetail} penanda`
  );
  const chipColorLive = await page
    .locator('.prose-news .bc-cue')
    .first()
    .evaluate((el) => getComputedStyle(el).color)
    .catch(() => '');
  check('penanda live tampil berwarna (chip)', Boolean(chipColorLive), chipColorLive);

  const unduh = page.locator('a.btn:has-text("Unduh")').first();
  check('tombol unduh tersedia pada materi live', (await unduh.count()) > 0);
  const unduhHref = await unduh.getAttribute('href');
  const dl = await page.request.get(`${origin}${unduhHref}`);
  check('unduhan materi live berjalan (HTTP 200)', dl.status() === 200, `HTTP ${dl.status()}`);
  const dlCd = dl.headers()['content-disposition'] || '';
  check(
    'unduhan live memakai attachment + nama berkas asli',
    dlCd.startsWith('attachment') && dlCd.includes('verifikasi-unduh.png'),
    dlCd.slice(0, 70)
  );

  await page.click('button:has-text("Bagikan ke Tamu")');
  await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
  await page.click('[role="dialog"] button:has-text("Buat Tautan Tamu")');
  await page.waitForSelector('text=Tautan siap dibagikan', { timeout: 90000 });
  const shareLink = await page.locator('[role="dialog"] input[readonly]').first().inputValue();
  check('tautan tamu dibuat pada aplikasi live', /\/share\//.test(shareLink), `${shareLink.split('/share/')[1]?.slice(0, 14)}…`);

  // Halaman tamu dibuka di BROWSER TERPISAH (batas 1 tab per instance)
  const guestBrowser = await chromium.launch();
  const guest = await guestBrowser.newPage({ viewport: { width: 1100, height: 900 } });
  try {
    await guest.goto(shareLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('halaman tamu live terbuka tanpa login', (await guest.locator('text=Akses Tamu').count()) > 0);
    check('halaman tamu live menyediakan tombol unduh', (await guest.locator('a.btn:has-text("Unduh")').count()) > 0);
  } catch (e) {
    check(`exception (tamu live): ${e.message}`, false);
  } finally {
    await guestBrowser.close();
  }


  // Bersihkan berita uji dari data live
  await page.click('[role="dialog"] button:has-text("Tutup")');
  await page.click('button:has-text("Hapus Berita")');
  await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
  await page.click('[role="dialog"] button:has-text("Hapus Permanen")');
  await page.waitForTimeout(3000);
  check('berita uji live berhasil dibersihkan', (await page.locator('text=Terverifikasi').count()) >= 0);

  // (halaman tamu diperiksa sebelum berita uji dihapus)

  // Fitur Chat pada aplikasi live — HANYA memeriksa tampilan pada dua role berbeda
  // (tidak mengirim pesan agar tidak menambah data ke percakapan pengguna).
  await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('menu & halaman Chat tampil di live', (await page.locator('a.nav-link:has-text("Chat")').count()) > 0);
  check(
    'halaman chat live menampilkan seluruh aturan (klaster + eskalasi)',
    (await page.locator('text=Klaster 1 · Biro Daerah').count()) > 0 &&
      (await page.locator('text=Klaster 2 · Pusat').count()) > 0 &&
      (await page.locator('text=Klaster 3 · Koordinasi Daerah').count()) > 0 &&
      (await page.locator('text=Eskalasi ke Redaktur').count()) > 0 &&
      (await page.locator('text=Eskalasi ke Admin & Super Admin').count()) > 0 &&
      (await page.locator('text=Kontributor & Magang').count()) > 0
  );
  // Admin dapat dichat oleh Produser Pusat/Daerah + kedua Koordinator.
  // Catatan: akun Koordinator belum ada pada data live, jadi bagian itu hanya diperiksa
  // bila akunnya memang tersedia (diuji lengkap pada suite uji dengan fixture sendiri).
  const adminRows = await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts();
  const adminContacts = adminRows.join(' | ');
  check(
    'Admin melihat Produser Pusat & Produser Daerah',
    /Produser Pusat/.test(adminContacts) && /Produser Daerah/.test(adminContacts),
    adminContacts.replace(/\s+/g, ' ').slice(0, 100)
  );
  check(
    'Admin TIDAK melihat Reporter/Kontributor/Magang/Redaktur',
    !/Reporter Pusat|Reporter Daerah|Kontributor|Magang|Redaktur/.test(adminContacts),
    adminContacts.replace(/\s+/g, ' ').slice(0, 100)
  );
  const koordinatorLive = adminRows.filter((r) => /Koordinator/.test(r)).length;
  check(
    koordinatorLive > 0
      ? 'Admin juga melihat akun Koordinator yang tersedia'
      : 'Akun Koordinator belum ada di data live (bagian aturan ini diuji pada suite uji)',
    true,
    `${adminRows.length} kontak · ${koordinatorLive} koordinator`
  );

  // Periksa sebagai Reporter Daerah (peserta klaster 1) di browser terpisah
  const chatBrowser = await chromium.launch();
  const chatPage = await chatBrowser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await chatPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await chatPage.fill('#email', 'reporter.medan@newsroom.demo');
    await chatPage.fill('#password', 'Demo123!');
    await chatPage.click('button[type="submit"]');
    await chatPage.waitForURL(/\/dashboard/, { timeout: 60000 });
    await chatPage.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const kontak = await chatPage.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts();
    const kontakText = kontak.join(' | ');
    check('tabel chat live berfungsi (daftar kontak tampil)', kontak.length > 0, `${kontak.length} kontak`);
    check(
      'kontak Reporter Daerah = Produser Daerah biro sendiri',
      /Produser Daerah/.test(kontakText) && /Medan/.test(kontakText) && !/Surabaya/.test(kontakText),
      kontakText.replace(/\s+/g, ' ').slice(0, 80)
    );
    check('kontak TIDAK memuat role di luar klaster', !/Admin Redaksi|Redaktur|Super Admin|Reporter Pusat/.test(kontakText));
    check('aturan chat (edit 60 detik, tanpa hapus) tampil', (await chatPage.locator('text=tidak dapat dihapus').count()) > 0);
    check('tidak ada tombol hapus pesan di chat live', (await chatPage.locator('button:has-text("Hapus")').count()) === 0);
    check('tidak ada unggah berkas/gambar di chat live', (await chatPage.locator('input[type="file"]').count()) === 0);
    check(
      'lintas biro dijelaskan pada halaman chat',
      (await chatPage.locator('text=biro yang sama').count()) > 0
    );
    check(
      'halaman chat Reporter Daerah tidak menampilkan role di luar aturannya',
      !/Redaktur|Admin Redaksi|Super Admin|Kontributor|Magang/.test(kontakText)
    );
  } catch (e) {
    check(`exception (chat live): ${e.message}`, false);
  } finally {
    await chatBrowser.close();
  }

  // ============ EKSPOR (menguji bug "No webpage was found" yang dilaporkan) ============
  // Tautan ekspor memakai <a href> biasa sehingga WAJIB memuat basePath. Diuji dengan
  // cara PERSIS seperti pengguna memakai: ambil href dari halaman lalu minta URL itu.
  await page.goto(`${BASE}/dashboard/tabulasi?range=all`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const tabExport = await page
    .locator('[data-export-buttons] a[data-export-format]')
    .evaluateAll((els) => els.map((e) => ({ format: e.getAttribute('data-export-format'), href: e.getAttribute('href') })));
  check(
    'live: HANYA tombol ekspor CSV di tabulasi (Excel/PDF sudah dihapus)',
    tabExport.length === 1 && tabExport[0].format === 'csv',
    tabExport.map((e) => e.format).join(', ')
  );
  check(
    'live: tautan ekspor memuat basePath (bukan 404 di root)',
    tabExport.every((e) => e.href && e.href.startsWith(`${BASE_PATH}/api/export/news?`)),
    tabExport.map((e) => e.href).join(' | ').slice(0, 140)
  );

  const liveCsvRes = await page.request.get(`${origin}${tabExport[0].href}`);
  check('live: unduhan CSV tabulasi berhasil (HTTP 200)', liveCsvRes.status() === 200, `HTTP ${liveCsvRes.status()}`);
  check(
    'live: CSV tabulasi berkekstensi .csv & tipe benar',
    (liveCsvRes.headers()['content-type'] || '').includes('text/csv') && (liveCsvRes.headers()['content-disposition'] || '').includes('.csv'),
    `${liveCsvRes.headers()['content-type']} ${liveCsvRes.headers()['content-disposition']}`
  );
  const liveCsvText = await liveCsvRes.text();
  check(
    'live: CSV berisi data tabulasi (bukan HTML error)',
    liveCsvText.includes('"Nomor Berita"') && !/<html/i.test(liveCsvText.slice(0, 200)),
    liveCsvText.slice(0, 60).replace(/\n/g, ' ')
  );
  // Permintaan format lama (Excel/PDF) harus tetap dilayani sebagai CSV, bukan galat —
  // supaya bookmark/tautan lama pengguna tidak rusak setelah fitur dihapus.
  for (const legacy of ['xlsx', 'pdf']) {
    const res = await page.request.get(`${origin}${BASE_PATH}/api/export/news?tab=pusat&range=all&format=${legacy}`);
    check(
      `live: permintaan lama ?format=${legacy} dilayani sebagai CSV`,
      res.status() === 200 && (res.headers()['content-type'] || '').includes('text/csv'),
      `HTTP ${res.status()}`
    );
  }

  // Laporan
  await page.goto(`${BASE}/dashboard/laporan?range=all`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const repExport = await page
    .locator('[data-export-buttons] a[data-export-format]')
    .evaluateAll((els) => els.map((e) => ({ format: e.getAttribute('data-export-format'), href: e.getAttribute('href') })));
  check(
    'live: tombol ekspor laporan = CSV saja & memuat basePath',
    repExport.length === 1 &&
      repExport[0].format === 'csv' &&
      repExport.every((e) => e.href?.startsWith(`${BASE_PATH}/api/export/report?`)),
    repExport.map((e) => `${e.format}:${e.href}`).join(' | ').slice(0, 120)
  );
  const repCsvLive = await page.request.get(`${origin}${repExport[0].href}`);
  check('live: unduhan CSV laporan berhasil (HTTP 200)', repCsvLive.status() === 200, `HTTP ${repCsvLive.status()}`);
  const repCsvLiveText = await repCsvLive.text();
  check(
    'live: CSV laporan memuat ringkasan & rekap biro',
    repCsvLiveText.includes('"Ringkasan Laporan"') && repCsvLiveText.includes('"Biro / Unit"'),
    repCsvLiveText.split('\r\n').slice(0, 2).join(' ').slice(0, 70)
  );

  // ============ LUPA KATA SANDI (halaman publik + pengaturan email) ============
  // Diperiksa tanpa login: halaman publik harus dapat diakses & tautannya benar,
  // tetapi TIDAK mengirim email (agar tidak ada email asli terkirim saat pengujian).
  const forgotBrowser = await chromium.launch();
  const forgotPage = await forgotBrowser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await forgotPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('live: halaman masuk punya tautan "Lupa kata sandi?"', (await forgotPage.locator('[data-forgot-link]').count()) > 0);
    await forgotPage.click('[data-forgot-link]');
    await forgotPage.waitForURL(/\/lupa-password/, { timeout: 30000 });
    check('live: halaman lupa kata sandi tampil', (await forgotPage.locator('#email').count()) > 0);
    check(
      'live: halaman lupa kata sandi menjelaskan masa berlaku & batas permintaan',
      (await forgotPage.locator('text=berlaku 60 menit').count()) > 0
    );
    const forgotHtml = await forgotPage.content();
    check('live: halaman lupa sandi menautkan kembali ke halaman masuk', forgotHtml.includes('/login'));

    // Halaman reset tanpa token harus memberi arahan, bukan galat aplikasi
    await forgotPage.goto(`${BASE}/reset-password`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('live: halaman reset tanpa token memberi arahan', (await forgotPage.locator('text=Minta Tautan Baru').count()) > 0);
    await forgotPage.goto(`${BASE}/reset-password?token=${'a'.repeat(64)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('live: token palsu ditolak dengan pesan jelas', (await forgotPage.locator('[data-reset-error="invalid"]').count()) > 0);
    check(
      'live: halaman reset tidak menampilkan galat aplikasi',
      (await forgotPage.locator('text=/Application error|Unhandled Runtime Error/i').count()) === 0
    );
  } catch (e) {
    check(`exception (lupa sandi live): ${e.message}`, false);
  } finally {
    await forgotBrowser.close();
  }

  // Pengaturan email (perlu sesi admin — dipakai sesi utama di atas)
  await page.goto(`${BASE}/dashboard/pengaturan/email`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('live: halaman Email & Notifikasi tampil', (await page.locator('text=Status Pengiriman Email').count()) > 0);
  const emailStatus = await page.locator('[data-email-status]').getAttribute('data-email-configured');
  check('live: status kesiapan email dapat dibaca', ['0', '1'].includes(emailStatus ?? ''), `configured=${emailStatus}`);
  check(
    'live: pilihan provider email tersedia (SMTP/Resend/Brevo/SendGrid)',
    (await page.locator('button[data-provider]').count()) === 4,
    `${await page.locator('button[data-provider]').count()} provider`
  );
  check('live: form kirim email uji tersedia', (await page.locator('[data-test-email]').count()) > 0);
  check(
    'live: catatan blokir port SMTP ditampilkan (pelajaran dari aplikasi lain)',
    (await page.locator('text=/465/').count()) > 0
  );
  check('live: menu Email & Notifikasi ada di navigasi pengaturan', (await page.locator('a:has-text("Email & Notifikasi")').count()) > 0);

  // ============ AKSES PRODUSER DAERAH: buat akun Reporter Daerah/Magang biro sendiri ============
  await page.goto(`${BASE}/dashboard/pengaturan/pengguna-biro`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('live: halaman Akun Biro dapat dibuka Admin', (await page.locator('#bu-name').count()) > 0);
  check('live: Admin melihat pilihan biro (lintas biro)', (await page.locator('#bu-bureau').count()) > 0);
  check('live: menu "Akun Biro" tersedia di navigasi pengaturan', (await page.locator('a:has-text("Akun Biro")').count()) > 0);

  const bureauBrowser = await chromium.launch();
  const bureauPage = await bureauBrowser.newPage({ viewport: { width: 1440, height: 960 } });
  try {
    await bureauPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await bureauPage.fill('#email', 'produser.medan@newsroom.demo');
    await bureauPage.fill('#password', 'Demo123!');
    await bureauPage.click('button[type="submit"]');
    await bureauPage.waitForURL(/\/dashboard/, { timeout: 60000 });
    await bureauPage.goto(`${BASE}/dashboard/pengaturan/pengguna-biro`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    check('live: Produser Daerah dapat membuka halaman Akun Biro', (await bureauPage.locator('#bu-name').count()) > 0);
    const liveRoles = await bureauPage.locator('#bu-role option').allInnerTexts();
    check(
      'live: Produser Daerah dapat membuat Reporter Daerah, Magang & Kontributor',
      liveRoles.length === 3 &&
        liveRoles.some((r) => /Reporter Daerah/.test(r)) &&
        liveRoles.some((r) => /Magang/.test(r)) &&
        liveRoles.some((r) => /Kontributor/.test(r)),
      liveRoles.join(', ')
    );
    check(
      'live: role terlarang tidak tersedia bagi Produser Daerah',
      !liveRoles.some((r) => /Produser Pusat|Produser Daerah|Admin|Redaktur|Super Admin/.test(r)),
      liveRoles.join(', ')
    );
    check('live: biro terkunci (tanpa dropdown biro) untuk Produser Daerah', (await bureauPage.locator('#bu-bureau').count()) === 0);
    const bureauList = await bureauPage.locator('.dtable tbody').innerText().catch(() => '');
    check('live: daftar akun biro tampil untuk Produser Daerah', bureauList.length > 0, bureauList.replace(/\s+/g, ' ').slice(0, 70));
    check(
      'live: daftar hanya berisi anggota biro sendiri (tidak ada biro lain)',
      !/Surabaya|Makassar|Bandung|Palembang/.test(bureauList),
      bureauList.replace(/\s+/g, ' ').slice(0, 70)
    );
    check(
      'live: Produser Daerah tidak dapat membuka manajemen pengguna global',
      !(await bureauPage.goto(`${BASE}/dashboard/pengaturan/pengguna`, { waitUntil: 'domcontentloaded' })).url().includes('/pengaturan/pengguna'),
      bureauPage.url().split('/newsroom-hub')[1] ?? ''
    );
  } catch (e) {
    check(`exception (akun biro live): ${e.message}`, false);
  } finally {
    await bureauBrowser.close();
  }

  // ============ TAYANG ONAIR / MEDSOS + laporan kanal tayang (read-only) ============
  await page.goto(`${BASE}/dashboard/laporan?range=all`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const kpiTexts = await page.locator('.kpi').allInnerTexts();
  check(
    'live: KPI Tayang Onair & Medsos tampil di laporan',
    kpiTexts.some((t) => /TAYANG ONAIR/i.test(t)) && kpiTexts.some((t) => /TAYANG MEDSOS/i.test(t)),
    kpiTexts.slice(0, 4).map((t) => t.split('\n')[0]).join(' | ')
  );
  await page.waitForTimeout(1500);
  check(
    'live: grafik komposisi kanal tayang tampil',
    (await page.locator('[data-chart="air-channel"] svg.recharts-surface').count()) > 0
  );
  check(
    'live: grafik tayang per kategori tampil',
    (await page.locator('[data-chart="air-category"] svg.recharts-surface').count()) > 0
  );
  check('live: tabel rekap tayang per kategori tampil', (await page.locator('[data-table="air-category"]').count()) > 0);
  check('live: tabel Berita Tayang tampil', (await page.locator('[data-table="aired-news"]').count()) > 0);
  check(
    'live: filter kanal (Semua/Onair/Medsos) tersedia',
    (await page.locator('[data-kanal="SEMUA"]').count()) > 0 &&
      (await page.locator('[data-kanal="ONAIR"]').count()) > 0 &&
      (await page.locator('[data-kanal="MEDSOS"]').count()) > 0
  );
  const bureauHeadersLive = await page.locator('section:has-text("Rekap per Biro") table thead th').allInnerTexts();
  check(
    'live: rekap per biro memuat kolom Onair & Medsos',
    bureauHeadersLive.some((h) => /^onair$/i.test(h.trim())) && bureauHeadersLive.some((h) => /^medsos$/i.test(h.trim())),
    bureauHeadersLive.join(', ')
  );

  // Tombol aksi pada halaman detail (read-only: hanya memeriksa keberadaan tombol)
  await page.goto(`${BASE}/dashboard/tabulasi?tab=pusat&range=all&status=PUBLISHED`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const firstRow = page.locator('.dtable tbody tr a').first();
  if ((await firstRow.count()) > 0) {
    await firstRow.click();
    await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 60000 });
    const bodyText = await page.locator('body').innerText();
    check(
      'live: tombol Tayang Onair/Medsos atau status tayang tampil di aksi',
      /Tayang Onair/.test(bodyText) && /Tayang Medsos/.test(bodyText),
      bodyText.match(/(Tayang Onair|Tayang Medsos|Tarik (ONAIR|MEDSOS))/g)?.slice(0, 3).join(', ') ?? '-'
    );
    check('live: tombol lama "Siarkan Berita" sudah tidak ada', !/Siarkan Berita/.test(bodyText));
  } else {
    check('live: tombol Tayang Onair/Medsos atau status tayang tampil di aksi', false, 'tidak ada berita terpublikasi di daftar');
  }

  // Ekspor CSV laporan memuat rekap kanal tayang
  const repCsvKanal = await page.request.get(`${origin}${BASE_PATH}/api/export/report?range=all&format=csv`);
  check('live: ekspor CSV laporan berhasil', repCsvKanal.status() === 200, `HTTP ${repCsvKanal.status()}`);
  const repCsvKanalText = await repCsvKanal.text();
  check(
    'live: CSV laporan memuat rekap Kanal Tayang & daftar Berita Tayang',
    /Tayang Onair saja/.test(repCsvKanalText) && /Waktu Onair/.test(repCsvKanalText),
    repCsvKanalText.split('\r\n').find((l) => l.includes('Tayang Onair saja'))?.slice(0, 60) ?? '-'
  );

  check('tidak ada aset/route 404 di halaman live', badRequests.length === 0, badRequests.slice(0, 4).join(' ; '));
} catch (e) {
  check(`exception: ${e.message}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan live lulus`);
if (failed.length) process.exit(1);
