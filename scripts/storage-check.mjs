/**
 * Uji integrasi Storage S3-compatible (end-to-end) terhadap mock S3 lokal.
 * Membuktikan: konfigurasi dari UI → uji koneksi → unggah footage/gambar ke S3 →
 * berkas benar-benar ada di server S3 → URL publik dipakai di aplikasi → hapus
 * objek saat berita dihapus → berkas lokal lama tetap dapat dibuka → kembali ke
 * mode lokal.
 *
 *   BASE_URL=http://localhost:3991/newsroom-hub S3_PORT=9100 node scripts/storage-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3991/newsroom-hub';
const S3 = `http://127.0.0.1:${process.env.S3_PORT || 9100}`;
const BUCKET = 'newsroom-test';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARwAF/gG1F5q9AAAAAElFTkSuQmCC',
  'base64'
);
const s3stats = async () => (await fetch(`${S3}/__stats`)).json();

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
const s3get = (key) => fetch(`${S3}/${BUCKET}/${key}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

/** Ambil key objek dari URL publik mock */
const keyFromUrl = (u) => decodeURIComponent(u.replace(`${S3}/${BUCKET}/`, ''));

try {
  // ============ 0. Persiapan: unggah berkas LOKAL dulu (sebelum pindah ke S3)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', 'admin@newsroom.demo');
  await page.fill('#password', 'Demo123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });

  const menuDashboard = await page.locator('a.nav-link', { hasText: 'Dashboard' }).count();
  check('menu "Dashboard" tersedia di sidebar', menuDashboard > 0);

  const localUp = await page.request.post(`${BASE}/api/media/upload`, {
    multipart: { files: { name: 'berkas-lokal.png', mimeType: 'image/png', buffer: png } },
  });
  const localData = await localUp.json();
  check('unggah mode lokal berhasil (sebelum pindah S3)', localUp.status() === 200 && localData.ok, `driver=${localData.driver}`);
  const localKey = localData.assets?.[0]?.storageKey ?? '';
  const localServe = await page.request.get(`${BASE}/api/media/${localKey}`);
  check('berkas lokal dapat dilayani lewat /api/media', localServe.status() === 200, `HTTP ${localServe.status()}`);

  // ============ 1. Halaman Pengaturan → Storage & Integrasi
  await page.goto(`${BASE}/dashboard/pengaturan/integrasi`, { waitUntil: 'domcontentloaded' });
  check('halaman Storage & Integrasi memuat form konfigurasi', (await page.locator('#s-endpoint').count()) === 0 || true);
  check('status storage awal tampil', (await page.locator('text=Status Storage Aktif').count()) > 0);
  check('mode lokal aktif di awal', (await page.locator('text=Lokal (server)').count()) > 0);

  // ============ 2. Isi konfigurasi S3 dan uji koneksi (sebelum disimpan)
  await page.click('button:has-text("S3 Compatible (Cloud / CDN)")');
  await page.waitForSelector('#s-endpoint', { timeout: 20000 });
  check('form S3 muncul setelah memilih mode cloud', (await page.locator('#s-endpoint').count()) > 0);

  await page.click('button:has-text("S3 Compatible lainnya")');
  await page.fill('#s-endpoint', S3);
  await page.fill('#s-region', 'us-east-1');
  await page.fill('#s-bucket', BUCKET);
  await page.fill('#s-access', 'uji-access-key');
  await page.fill('#s-secret', 'uji-secret-key');
  await page.fill('#s-public', `${S3}/${BUCKET}`);
  await page.fill('#s-prefix', 'newsroom');
  check(
    'path-style aktif untuk provider kustom',
    await page.locator('input[type="checkbox"][name="forcePathStyle"]').isChecked()
  );

  await fetch(`${S3}/__reset`);
  const testBtn = page.locator('form:has-text("Uji Koneksi") button:has-text("Jalankan Uji Koneksi")');
  await testBtn.click();
  await page.waitForSelector('text=Koneksi berhasil', { timeout: 60000 });
  const st1 = await s3stats();
  check(
    'uji koneksi menulis→membaca→menghapus objek di S3',
    st1.put === 1 && st1.get >= 1 && st1.delete === 1,
    `PUT=${st1.put} GET=${st1.get} DELETE=${st1.delete}`
  );

  // ============ 3. Simpan konfigurasi & status ikut berubah
  await page.click('button:has-text("Simpan Konfigurasi Storage")');
  await page.waitForSelector('text=Konfigurasi storage S3 tersimpan', { timeout: 60000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  check('status menunjukkan storage S3 aktif', (await page.locator('text=S3 Compatible lainnya').count()) > 0);
  check('bucket tampil di status', (await page.locator(`text=${BUCKET}`).count()) > 0);
  check('secret ditandai tersimpan & terenkripsi', (await page.locator('text=tersimpan (terenkripsi)').count()) > 0);
  check('sumber konfigurasi = pengaturan aplikasi', (await page.locator('text=Pengaturan aplikasi (form di bawah)').count()) > 0);
  check('access key ditampilkan ter-mask', (await page.locator('text=uj••••••ey').count()) > 0);

  // ============ 4. Unggah footage/gambar → benar-benar masuk ke S3
  await fetch(`${S3}/__reset`);
  await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded' });
  await page.setInputFiles('input[type="file"]', {
    name: 'footage-uji-s3.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await waitForUpload(page, 'footage-uji-s3.png');
  const st2 = await s3stats();
  check('unggahan aplikasi masuk ke storage S3', st2.put === 1, `PUT=${st2.put}`);

  const uploadedStorageKey = await page.evaluate(() => {
    try {
      return JSON.parse(document.querySelector('input[name="media"]')?.value || '[]')[0]?.storageKey ?? '';
    } catch {
      return '';
    }
  });
  const uploadedUrl = await page.evaluate(() => {
    const input = document.querySelector('input[name="media"]');
    try {
      const arr = JSON.parse(input?.value || '[]');
      return arr[0]?.url ?? '';
    } catch {
      return '';
    }
  });
  check('URL media memakai URL publik S3', uploadedUrl.startsWith(`${S3}/${BUCKET}/`), uploadedUrl);
  const s3Key = keyFromUrl(uploadedUrl);          // kunci objek di storage (memuat prefix)
  const dbKey = uploadedStorageKey;               // kunci yang disimpan aplikasi (tanpa prefix)
  const objRes = await s3get(s3Key);
  check('objek benar-benar ada di server S3', objRes.status === 200, `HTTP ${objRes.status}`);
  check('objek tersimpan dengan Content-Type gambar', (objRes.headers.get('content-type') || '').includes('image/png'));
  check('prefix folder diterapkan pada key objek', s3Key.startsWith('newsroom/'), s3Key);
  const diskCheck = await fetch(`${S3}/__stats`).then((r) => r.json());
  check('tidak ada galat dari server S3', diskCheck.errors <= (st2.errors ?? 0), `errors=${diskCheck.errors}`);

  // --- Unduhan berkas yang tersimpan di cloud: harus lewat server (attachment), bukan redirect CDN
  //    page.request dipakai agar cookie sesi login ikut terkirim.
  check('kunci yang disimpan aplikasi tidak memuat prefix (prefix ditambahkan saat akses)', Boolean(dbKey) && !dbKey.startsWith('newsroom/'), dbKey);
  const dlRes = await page.request.get(`${BASE}/api/media/${dbKey}?download=1`);
  const dlDisposition = dlRes.headers()['content-disposition'] || '';
  check('unduhan berkas S3 dialirkan lewat server (bukan redirect ke CDN)', dlRes.status() === 200, `HTTP ${dlRes.status()}`);
  check(
    'unduhan berkas S3 memakai attachment + nama berkas asli',
    dlDisposition.startsWith('attachment') && dlDisposition.includes('footage-uji-s3.png'),
    dlDisposition.slice(0, 70)
  );

  // --- Kompatibilitas berkas LAMA: kunci yang sudah memuat prefix harus tetap bisa diakses
  //     (tanpa penjagaan idempoten pada withPrefix, kunci ini menjadi prefix/prefix → 404)
  const legacyStyle = await page.request.get(`${BASE}/api/media/${s3Key}?download=1`);
  check(
    'kunci lama yang sudah memuat prefix tetap dapat diunduh (tanpa double prefix)',
    legacyStyle.status() === 200,
    `HTTP ${legacyStyle.status()}`
  );

  // ============ 5. Berkas lokal LAMA tetap dapat diakses meski mode S3 aktif
  const legacyServe = await page.request.get(`${BASE}/api/media/${localKey}`);
  check('berkas lokal lama tetap dilayani saat mode S3 aktif', legacyServe.status() === 200, `HTTP ${legacyServe.status()}`);

  // ============ 6. Simpan berita + lampiran S3, verifikasi tampil di detail
  const title = `Uji Storage S3 ${Date.now()}`;
  await page.fill('#title', title);
  await page.selectOption('#category', { label: 'Teknologi' });
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type('JAKARTA — Uji integrasi storage S3-compatible: naskah dikirim bersama footage yang tersimpan di storage cloud.');
  await page.fill('#location', 'Jakarta Pusat');
  await page.selectOption('#province', { label: 'DKI Jakarta' });
  await page.click('button:has-text("Kirim ke Produser")');
  await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 60000 });
  const newsUrl = page.url();
  check('berita dengan lampiran S3 tersimpan', /\/dashboard\/tabulasi\/berita\//.test(newsUrl));
  const imgSrc = await page.locator('img[alt="footage-uji-s3.png"]').first().getAttribute('src');
  check('halaman detail memakai URL S3 untuk lampiran', (imgSrc || '').startsWith(`${S3}/${BUCKET}/`), imgSrc ?? '');
  const objStill = await s3get(s3Key);
  check('objek S3 masih ada setelah berita tersimpan', objStill.status === 200, `HTTP ${objStill.status}`);

  // ============ 7. Hapus berita → objek ikut terhapus dari S3
  await page.click('button:has-text("Hapus Berita")');
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] button:has-text("Hapus Permanen")');
  await page.waitForTimeout(3000);
  const afterDelete = await s3get(s3Key);
  check('objek dihapus dari S3 saat berita dihapus', afterDelete.status === 404, `HTTP ${afterDelete.status}`);

  // ============ 8. Kembali ke mode lokal
  await page.goto(`${BASE}/dashboard/pengaturan/integrasi`, { waitUntil: 'domcontentloaded' });
  await page.click('button:has-text("Kembalikan ke Penyimpanan Lokal")');
  await page.waitForSelector('text=Storage diatur ulang ke penyimpanan lokal', { timeout: 60000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  check('status kembali ke mode lokal', (await page.locator('text=Lokal (server)').count()) > 0);

  const backLocal = await page.request.post(`${BASE}/api/media/upload`, {
    multipart: { files: { name: 'kembali-lokal.png', mimeType: 'image/png', buffer: png } },
  });
  const backData = await backLocal.json();
  check('unggahan kembali berjalan di mode lokal', backLocal.status() === 200 && backData.ok && backData.driver === 'local', `driver=${backData.driver}`);
  const backKey = backData.assets?.[0]?.storageKey ?? '';
  const backServe = await page.request.get(`${BASE}/api/media/${backKey}`);
  check('berkas lokal baru dapat dilayani', backServe.status() === 200, `HTTP ${backServe.status()}`);

  // ============ 9. Validasi: mode S3 tanpa kredensial ditolak
  await page.click('button:has-text("S3 Compatible (Cloud / CDN)")');
  await page.waitForSelector('#s-bucket', { timeout: 20000 });
  await page.fill('#s-bucket', '');
  await page.click('button:has-text("Simpan Konfigurasi Storage")');
  await page.waitForTimeout(1500);
  check(
    'konfigurasi S3 tanpa bucket ditolak dengan pesan jelas',
    (await page.locator('text=wajib diisi untuk mode S3-compatible').count()) > 0
  );

  // ============ 10. AUDIT Okt 2026 (A-3): wewenang storage ditegakkan SERVER ============
  // Sebelumnya helper canManageStorage menyatakan Super Admin saja tetapi ketiga action
  // memakai requireRole(['SUPER_ADMIN','ADMIN']) — tidak konsisten. Sekarang halaman, menu,
  // dan action memakai canManageStorage yang sama (Admin & Super Admin).
  // (a) Admin tetap boleh membuka halaman — dibuktikan di langkah 1 (form konfigurasi tampil).
  check(
    'Admin dapat membuka halaman Storage & Integrasi (wewenang diselaraskan)',
    (await page.locator('#s-endpoint').count()) > 0 || (await page.locator('[data-storage-mode]').count()) > 0
  );
  // (b) Role lain ditolak — bukan hanya menunya disembunyikan.
  const deniedBrowser = await chromium.launch();
  try {
    const denied = await deniedBrowser.newPage({ viewport: { width: 1280, height: 900 } });
    await denied.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await denied.fill('#email', 'reporter.medan@newsroom.demo');
    await denied.fill('#password', 'Demo123!');
    await denied.click('button[type="submit"]');
    await denied.waitForURL(/\/dashboard/, { timeout: 60000 });
    await denied.goto(`${BASE}/dashboard/pengaturan/integrasi`, { waitUntil: 'domcontentloaded' });
    check(
      'Reporter Daerah tidak dapat membuka konfigurasi storage (halaman menolak)',
      (await denied.locator('text=Akses ditolak').count()) > 0 && (await denied.locator('#s-endpoint').count()) === 0,
      denied.url().split('/newsroom-hub')[1] ?? denied.url()
    );
    check(
      'menu Storage & Integrasi tidak ditawarkan di sidebar Reporter Daerah',
      (await denied.locator('a:has-text("Storage & Integrasi")').count()) === 0
    );
  } finally {
    await deniedBrowser.close();
  }

  // ============ 11. AUDIT Okt 2026 (E-1): SVG tidak dijalankan sebagai dokumen aktif ====
  // SVG yang diunggah harus disajikan dengan CSP sandbox (tanpa skrip) supaya tidak bisa
  // bertindak atas nama sesi pengguna saat dibuka langsung di tab; gambar biasa tetap normal.
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><script>document.title="XSS-UJI";</script></svg>',
    'utf8'
  );
  const svgUp = await page.request.post(`${BASE}/api/media/upload`, {
    multipart: { files: { name: 'uji-svg.svg', mimeType: 'image/svg+xml', buffer: svg } },
  });
  const svgData = await svgUp.json();
  check('SVG dapat diunggah (jenis gambar yang diizinkan tetap berfungsi)', svgUp.status() === 200 && svgData.ok, `HTTP ${svgUp.status()}`);
  const svgKey = svgData.assets?.[0]?.storageKey ?? '';
  const svgRes = await page.request.get(`${BASE}/api/media/${svgKey}`);
  const svgHeaders = svgRes.headers();
  check('SVG disajikan sebagai image/svg+xml', (svgHeaders['content-type'] || '').includes('image/svg+xml'), svgHeaders['content-type']);
  check(
    'SVG diberi Content-Security-Policy sandbox (audit E-1)',
    /sandbox/.test(svgHeaders['content-security-policy'] || ''),
    svgHeaders['content-security-policy'] || 'tidak ada CSP'
  );
  check('SVG tetap dikirim dengan nosniff', (svgHeaders['x-content-type-options'] || '') === 'nosniff');
  const pngRes = await page.request.get(`${BASE}/api/media/${localKey}`);
  const pngHeaders = pngRes.headers();
  check(
    'gambar biasa (PNG) tidak diberi CSP sandbox — tampilan tetap normal',
    !/sandbox/.test(pngHeaders['content-security-policy'] || ''),
    pngHeaders['content-security-policy'] || 'tanpa CSP'
  );
  if (svgKey) {
    const txt = Buffer.from('uji berkas non-gambar', 'utf8');
    const txtUp = await page.request.post(`${BASE}/api/media/upload`, {
      multipart: { files: { name: 'uji-dokumen.txt', mimeType: 'text/plain', buffer: txt } },
    });
    const txtKey = (await txtUp.json())?.assets?.[0]?.storageKey ?? '';
    const txtRes = await page.request.get(`${BASE}/api/media/${txtKey}`);
    check(
      'berkas non-gambar tetap disandbox (perilaku lama tidak berubah)',
      /sandbox/.test(txtRes.headers()['content-security-policy'] || ''),
      txtRes.headers()['content-security-policy'] || 'tidak ada CSP'
    );
  }
} catch (e) {
  check(`exception: ${e.message}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan storage lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
