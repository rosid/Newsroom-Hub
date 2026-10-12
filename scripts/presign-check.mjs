/**
 * Uji UNGGAHAN LANGSUNG KE STORAGE (pre-signed URL) end-to-end, memakai DUA mock S3:
 *   - MOCK_OK  (CORS=on)  → unggahan langsung harus berhasil dan TIDAK melewati server web
 *   - MOCK_BAD (CORS=off) → unggahan langsung ditolak browser, aplikasi harus MUNDUR ke
 *                           jalur lewat server dan unggahan tetap berhasil
 *
 * Bukti "tidak melewati server web":
 *   - permintaan PUT dari browser diarahkan ke URL mock S3 (bukan host aplikasi) dan
 *     memuat parameter SigV4 (X-Amz-Signature, X-Amz-Expires, X-Amz-SignedHeaders)
 *   - TIDAK ada permintaan POST ke /api/media/upload untuk berkas tersebut (jalur server)
 *   - objek benar-benar ada di mock S3 (dicek dari endpoint /__stats)
 *
 *   BASE_URL=... S3_OK=9100 S3_BAD=9101 node scripts/presign-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3992/newsroom-hub';
const S3_OK = Number(process.env.S3_OK || 9100);
const S3_BAD = Number(process.env.S3_BAD || 9101);
// Mock S3 memakai HTTPS (CSP aplikasi hanya mengizinkan https: untuk koneksi browser)
const OK_ORIGIN = `https://127.0.0.1:${S3_OK}`;
const BAD_ORIGIN = `https://127.0.0.1:${S3_BAD}`;

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

// Proses uji ini memanggil mock lewat HTTPS dengan sertifikat uji (self-signed)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const mockStats = async (port) => (await fetch(`https://127.0.0.1:${port}/__stats`)).json();
const mockReset = async (port) => fetch(`https://127.0.0.1:${port}/__reset`).then((r) => r.json());

const makeFile = (name, size, mimeType) => {
  const head = Buffer.from('UJI-PRESIGN-NEWSROOM\n');
  const body = Buffer.alloc(Math.max(0, size - head.length), 5);
  return { name, mimeType, buffer: Buffer.concat([head, body]) };
};

const browser = await chromium.launch();
// ignoreHTTPSErrors: browser uji memercayai sertifikat mock S3 (uji lokal saja)
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
const page = await context.newPage();

/** Rekam lalu lintas jaringan untuk memeriksa jalur unggah yang dipakai. */
const net = { presign: 0, confirm: 0, serverUpload: 0, directPuts: [], blockedOptions: [] };
page.on('request', (r) => {
  const u = r.url();
  const m = r.method();
  if (u.includes('/api/media/presign')) net.presign += 1;
  else if (u.includes('/api/media/confirm')) net.confirm += 1;
  else if (u.includes('/api/media/upload')) net.serverUpload += 1;
  else if (m === 'PUT' && (u.startsWith(OK_ORIGIN) || u.startsWith(BAD_ORIGIN))) {
    net.directPuts.push(u);
  }
});

const title = `Uji Presign ${Date.now()}`;

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', 'admin@newsroom.demo');
  await page.fill('#password', 'Demo123!');
  await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 60000 }), page.click('button[type="submit"]')]);
}

/** Simpan konfigurasi storage lewat UI (endpoint mock S3) dan verifikasi statusnya. */
async function setStorage(endpoint) {
  await page.goto(`${BASE}/dashboard/pengaturan/integrasi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('button:has-text("S3 Compatible (Cloud / CDN)")');
  await page.waitForSelector('#s-endpoint', { timeout: 30000 });
  // Penyedia dipilih lewat tombol preset (bukan <select>)
  await page.click('button:has-text("S3 Compatible lainnya")');
  await page.fill('#s-endpoint', endpoint);
  await page.fill('#s-region', 'us-east-1');
  await page.fill('#s-bucket', 'berita');
  await page.fill('#s-access', 'mock-access');
  await page.fill('#s-secret', 'mock-secret');
  await page.fill('#s-public', '');
  await page.click('button:has-text("Simpan Konfigurasi")');
  await page.waitForSelector('text=Konfigurasi storage S3 tersimpan', { timeout: 60000 });
  await page.waitForTimeout(1200);
}

const statusPanel = { direct: () => page.locator('[data-direct-upload]') };

/** Unggah satu berkas di form Kirim Berita; kembalikan teks status baris lampiran. */
async function uploadOne(file) {
  await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // input file sengaja disembunyikan (dipicu tombol "Pilih Berkas") → tunggu sampai terpasang
  await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 30000 });
  await page.setInputFiles('input[type="file"]', {
    name: file.name,
    mimeType: file.mimeType,
    buffer: file.buffer,
  });
  await page.waitForSelector(`li:has-text("${file.name}")`, { timeout: 30000 });
  // tunggu sampai baris lampiran menampilkan "selesai"
  await page.waitForSelector(`li:has-text("${file.name}"):has-text("selesai")`, { timeout: 90000 });
  return (await page.locator(`li:has-text("${file.name}")`).first().innerText()).replace(/\s+/g, ' ');
}

try {
  await mockReset(S3_OK);
  await mockReset(S3_BAD);
  await login();

  // Admin seharusnya dapat membuka halaman integrasi (izin)
  await page.goto(`${BASE}/dashboard/pengaturan/integrasi`, { waitUntil: 'domcontentloaded' });
  check('halaman Storage & Integrasi dapat dibuka', (await page.locator('text=Status Storage Aktif').count()) > 0);
  check(
    'status unggahan langsung ditampilkan di halaman integrasi',
    (await statusPanel.direct().count()) === 1,
    (await statusPanel.direct().innerText().catch(() => '')).trim()
  );

  // ---------- 1. Jalur LANGSUNG (mock S3 dengan CORS aktif) ----------
  await setStorage(OK_ORIGIN);
  const directBadge = (await statusPanel.direct().innerText()).trim();
  check('status menyatakan unggahan langsung AKTIF saat storage S3 siap', /Aktif/i.test(directBadge), directBadge);

  await mockReset(S3_OK);
  net.presign = net.confirm = net.serverUpload = 0;
  net.directPuts = [];

  const file1 = makeFile('presign-langsung.mp4', 900_000, 'video/mp4');
  const line1 = await uploadOne(file1);

  check('berkas terunggah & tercatat selesai', /selesai/i.test(line1), line1.slice(0, 120));
  check('baris lampiran menandai unggahan langsung ke storage', /langsung ke storage/i.test(line1), line1.slice(0, 120));

  const putOk = net.directPuts.find((u) => u.startsWith(OK_ORIGIN));
  check(
    'browser mengirim PUT ke URL pre-signed mock S3 (bukan host aplikasi)',
    Boolean(putOk) && !putOk.includes('/newsroom-hub/api/'),
    putOk ? `${new URL(putOk).host}${new URL(putOk).pathname}` : 'tidak ada PUT'
  );
  const putUrl = putOk ? new URL(putOk) : null;
  check(
    'URL pre-signed memuat tanda tangan SigV4 + masa berlaku 15 menit',
    Boolean(putUrl) &&
      putUrl.searchParams.has('X-Amz-Signature') &&
      putUrl.searchParams.get('X-Amz-Expires') === '900' &&
      putUrl.searchParams.has('X-Amz-Credential'),
    putUrl ? `expires=${putUrl.searchParams.get('X-Amz-Expires')}` : '-'
  );
  check(
    'Content-Type ikut ditandatangani (header wajib ada di URL)',
    Boolean(putUrl) && /content-type/i.test(putUrl.searchParams.get('X-Amz-SignedHeaders') || ''),
    putUrl ? putUrl.searchParams.get('X-Amz-SignedHeaders') : '-'
  );
  check('server web TIDAK menerima byte berkas (tanpa POST /api/media/upload)', net.serverUpload === 0, `${net.serverUpload} permintaan`);
  check('server hanya menerima permintaan presign & confirm', net.presign === 1 && net.confirm === 1, `presign=${net.presign} confirm=${net.confirm}`);

  const statsOk = await mockStats(S3_OK);
  const signedOk = statsOk.signedUrls.find((s) => s.method === 'PUT' && s.key.includes('presign-langsung.mp4'));
  check('mock S3 mencatat PUT bertanda tangan untuk key objek', Boolean(signedOk), statsOk.lastKeys.slice(-3).join(' | '));
  check(
    'key objek memakai folder di bucket (prefix) & struktur tanggal',
    Boolean(signedOk) && /^berita\/newsroom\/\d{4}\/\d{2}\//.test(signedOk.key),
    signedOk?.key
  );

  // berita benar-benar memakai lampiran tersebut (tersimpan sebagai MediaAsset)
  await page.fill('#title', title);
  await page.selectOption('#category', { label: 'Ekonomi' });
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type(
    'JAKARTA — Uji otomatis jalur unggahan langsung ke storage (pre-signed URL) untuk memastikan lampiran tercatat pada berita.'
  );
  await page.click('button:has-text("Breaking News")');
  // Kelengkapan lain yang wajib diisi form kirim berita
  await page.fill('#summary', 'Ringkasan uji jalur unggahan langsung ke storage.');
  await page.fill('#location', 'Kawasan Uji, Jakarta Pusat');
  await page.selectOption('#province', { label: 'DKI Jakarta' });
  await page.fill('#city', 'Jakarta');
  await page.fill('#latitude', '-6.18624');
  await page.fill('#longitude', '106.83875');
  await Promise.all([
    page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 60000 }),
    page.click('button:has-text("Kirim Berita")'),
  ]);
  const newsUrl = page.url();
  check('berita uji terkirim dengan lampiran', /\/dashboard\/tabulasi\/berita\//.test(newsUrl), newsUrl.split('/').pop());
  check('detail berita menampilkan lampiran hasil unggahan langsung', (await page.locator('text=1 lampiran').count()) > 0);

  // ---------- 2. Jalur CADANGAN (mock S3 TANPA CORS) ----------
  await setStorage(BAD_ORIGIN);
  await mockReset(S3_BAD);
  net.presign = net.confirm = net.serverUpload = 0;
  net.directPuts = [];

  const file2 = makeFile('presign-cadangan.mp4', 700_000, 'video/mp4');
  const line2 = await uploadOne(file2);
  check('berkas tetap berhasil diunggah walau unggahan langsung diblokir CORS', /selesai/i.test(line2), line2.slice(0, 140));
  check('baris lampiran menandai unggahan lewat server', /lewat server/i.test(line2), line2.slice(0, 140));
  check('klien meminta URL bertanda tangan lebih dulu', net.presign >= 1, `${net.presign} permintaan presign`);
  const statsBadAttempt = await mockStats(S3_BAD);
  check(
    'storage tanpa CORS menolak preflight browser (bukti percobaan unggahan langsung)',
    statsBadAttempt.corsBlocked > 0,
    `preflight ditolak=${statsBadAttempt.corsBlocked}`
  );
  check('jalur cadangan memakai POST /api/media/upload', net.serverUpload === 1, `${net.serverUpload} permintaan`);
  const statsBad = await mockStats(S3_BAD);
  check(
    'berkas tersimpan di penyedia storage lewat jalur server',
    statsBad.lastKeys.some((k) => k.includes('presign-cadangan.mp4')),
    statsBad.lastKeys.slice(-3).join(' | ')
  );
  check(
    'pengguna diberi tahu penyebab mundurnya jalur (CORS)',
    (await page.locator('text=CORS').count()) > 0 && (await page.locator('text=dikirim lewat server').count()) > 0
  );

  // ---------- 3. Pengamanan endpoint ----------
  const bogus = await page.request.post(`${BASE}/api/media/confirm`, {
    data: { storageKey: '2026/10/abcd1234-berkas-jahat.mp4', filename: 'berkas-jahat.mp4', size: 1000, mimeType: 'video/mp4' },
  });
  check('confirm menolak key yang tidak berasal dari server (tanpa header/kunci uji)', bogus.status() === 404 || bogus.status() === 400, `HTTP ${bogus.status()}`);
  const traversal = await page.request.post(`${BASE}/api/media/confirm`, {
    data: { storageKey: '../../rahasia.mp4', filename: '../../rahasia.mp4', size: 10, mimeType: 'video/mp4' },
  });
  check('confirm menolak key bermotif path-traversal', traversal.status() === 400, `HTTP ${traversal.status()}`);
  const wrongExt = await page.request.post(`${BASE}/api/media/presign`, {
    data: { files: [{ filename: 'virus.exe', size: 100, contentType: 'application/octet-stream' }] },
  });
  check('presign menolak jenis berkas yang tidak diizinkan', wrongExt.status() === 415, `HTTP ${wrongExt.status()}`);
  const tooBig = await page.request.post(`${BASE}/api/media/presign`, {
    data: { files: [{ filename: 'besar.mp4', size: 400 * 1024 * 1024, contentType: 'video/mp4' }] },
  });
  check('presign menolak berkas melebihi batas ukuran', tooBig.status() === 413, `HTTP ${tooBig.status()}`);

  // Bersihkan: hapus berita uji
  await page.goto(newsUrl, { waitUntil: 'domcontentloaded' });
  await page.click('button:has-text("Hapus Berita")');
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] button:has-text("Hapus Permanen")');
  await page.waitForTimeout(2500);
  check('berita uji dibersihkan kembali', (await page.locator(`text=${title}`).count()) === 0);
} catch (e) {
  check(`exception: ${(e && e.message) || e}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan presign lulus`);
if (failed.length) {
  console.log('Gagal:');
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` — ${f.extra}` : ''}`);
  process.exit(1);
}
