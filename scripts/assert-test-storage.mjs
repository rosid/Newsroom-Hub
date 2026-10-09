/**
 * PENJAGA UJI: memastikan aplikasi uji benar-benar memakai PENYIMPANAN LOKAL
 * sebelum uji tulis/unggah dijalankan.
 *
 * Penting: database aplikasi dapat memuat kredensial storage PRODUKSI (mis. BunnyCDN
 * milik pengguna). Bila salinan DB di /tmp tidak dinetralkan, uji akan menulis
 * berkas ke storage pengguna. Skrip ini memeriksa TAMPA-TAMPA penyimpanan yang
 * dilihat aplikasi (bukan hanya isi DB) lalu keluar dengan status 1 bila bukan lokal.
 *
 *   BASE_URL=http://localhost:3998/newsroom-hub node scripts/assert-test-storage.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error('[penjaga] BASE_URL wajib diisi');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  // Retry: permintaan pertama setelah build/start bisa lambat (cold start)
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForSelector('#email', { timeout: 30000 });
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await page.waitForTimeout(3000);
    }
  }
  await page.fill('#email', 'admin@newsroom.demo');
  await page.fill('#password', 'Demo123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
  await page.goto(`${BASE}/dashboard/pengaturan/integrasi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Sinyal andal: atribut data-storage-mode pada panel status (teks bebas memuat nama
  // penyedia hanya sebagai penjelasan, jadi jangan dipakai).
  // Catatan: atribut bisa BELUM ada saat HTML pertama datang (render/cache), jadi tunggu
  // eksplisit dulu sebelum menyimpulkan — nilai null berarti "belum terbaca", bukan "S3".
  await page
    .waitForSelector('[data-storage-status][data-storage-mode]', { timeout: 30000 })
    .catch(() => null);

  let mode = await page.locator('[data-storage-status]').first().getAttribute('data-storage-mode');
  if (mode !== 'local') {
    // Coba lagi: cache/settings bisa tertinggal sesaat antar-run
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .waitForSelector('[data-storage-status][data-storage-mode]', { timeout: 30000 })
      .catch(() => null);
    mode = await page.locator('[data-storage-status]').first().getAttribute('data-storage-mode');
  }
  if (mode !== 'local') {
    console.error(
      `[penjaga] DIBATALKAN: storage yang dilihat aplikasi BUKAN lokal (mode=${JSON.stringify(mode)}) — ` +
        'uji tulis akan menulis ke storage produksi pengguna.'
    );
    process.exit(1);
  }
  console.log('[penjaga] storage aplikasi = lokal (aman untuk uji tulis)');
} catch (e) {
  console.error('[penjaga] gagal memeriksa storage:', e.message);
  process.exit(1);
} finally {
  await browser.close();
}
