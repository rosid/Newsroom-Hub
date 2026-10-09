/**
 * Uji unggah lampiran: PROGRES + BANYAK footage sekaligus.
 *
 * Jaringan di-throttle lewat CDP (upload ~512 KB/s) supaya progres dan keadaan
 * "sedang mengunggah" benar-benar dapat diamati (unggahan lokal terlalu cepat).
 *
 *   BASE_URL=http://localhost:3977/newsroom-hub node scripts/upload-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3977/newsroom-hub';
const UPLOAD_BYTES_PER_SEC = Number(process.env.UPLOAD_THROTTLE ?? 512 * 1024);
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

/** Berkas uji dengan isi acak (ekstensi menentukan jenis berkas di server). */
const makeFile = (name, size, mimeType) => {
  const head = Buffer.from('UJI-UNGGAH-NEWSROOM\n');
  const body = Buffer.alloc(Math.max(0, size - head.length), 7);
  return { name, mimeType, buffer: Buffer.concat([head, body]) };
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const title = `Uji Unggah Ganda ${Date.now()}`;

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', 'admin@newsroom.demo');
  await page.fill('#password', 'Demo123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });

  // ---- Throttle unggahan supaya progres terlihat & dapat diuji
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 20,
    downloadThroughput: -1,
    uploadThroughput: UPLOAD_BYTES_PER_SEC,
  });

  await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded' });

  // ---- UI: input mendukung banyak berkas sekaligus
  const multiple = await page.locator('input[type="file"]').first().getAttribute('multiple');
  check('pemilih berkas mendukung banyak lampiran sekaligus', multiple !== null);
  check('form menyebut boleh lebih dari satu footage', (await page.locator('text=beberapa footage/gambar sekaligus').count()) > 0);

  // ---- Rekam semua nilai progres yang muncul (MutationObserver)
  // (JS murni — dieksekusi di browser, bukan TypeScript)
  await page.evaluate(() => {
    window.__progres = [];
    const rec = () => {
      document.querySelectorAll('[role="progressbar"]').forEach((el) => {
        const v = Number(el.getAttribute('aria-valuenow'));
        if (Number.isFinite(v)) window.__progres.push(v);
      });
    };
    new MutationObserver(rec).observe(document.body, { attributes: true, childList: true, subtree: true });
    rec();
  });

  // ---- Pilih 3 berkas sekaligus (2 footage + 1 gambar)
  const foot1 = makeFile('footage-lapangan-1.mp4', 1_600_000, 'video/mp4');
  const foot2 = makeFile('footage-lapangan-2.mp4', 1_400_000, 'video/mp4');
  const img1 = makeFile('foto-pelengkap.png', 120_000, 'image/png');
  await page.setInputFiles('input[type="file"]', [foot1, foot2, img1]);

  // ---- Ketiga berkas masuk daftar & antrean berjalan
  await page.waitForSelector('text=footage-lapangan-1.mp4', { timeout: 30000 });
  const listed = await page.locator('li:has-text(".mp4"), li:has-text(".png")').count();
  check('ketiga berkas tampil di daftar unggahan', listed >= 3, `${listed} baris`);
  check('antrean unggahan berjalan (indikator progres keseluruhan)', (await page.locator('text=/Mengunggah \\d+ berkas/').count()) > 0);

  // ---- Selama mengunggah: tombol kirim harus nonaktif
  const submitBtn = page.locator('button:has-text("Kirim ke Produser")');
  const disabledDuring = await submitBtn.isDisabled();
  check('tombol kirim dinonaktifkan selama unggahan berjalan', disabledDuring);
  check('ada pemberitahuan menunggu unggahan selesai', (await page.locator('text=Lampiran sedang diunggah').count()) > 0);

  // ---- Coba kirim paksa lewat Enter (harus dicegah)
  const titleField = page.locator('#title');
  await titleField.fill(title);
  await titleField.press('Enter');
  await page.waitForTimeout(700);
  check('kirim paksa saat unggah berjalan dicegah', page.url().includes('/dashboard/kirim'), page.url().split('/newsroom-hub')[1] ?? '');

  // ---- Cek progres per berkas benar-benar bergerak (ada nilai di antara 0 dan 100)
  await page.waitForFunction(() => (window.__progres || []).some((v) => v > 0 && v < 100), undefined, { timeout: 60000 });
  const partialCount = await page.evaluate(
    () => (window.__progres || []).filter((v) => v > 0 && v < 100).length
  );
  check('bilah progres mulai bergerak saat unggahan berjalan', partialCount >= 3, `${partialCount} pembaruan sebagian`);
  check(
    'teks persentase per berkas tampil',
    (await page.locator('text=/%$/').count()) > 0 || (await page.locator('text=/terkirim \\(\\d+%\\)/').count()) > 0
  );

  // ---- Tunggu semua selesai
  await page.waitForFunction(
    () => {
      const el = document.querySelector('input[name="media"]');
      try {
        return JSON.parse(el?.value || '[]').length === 3;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 300000 }
  );
  check('ketiga lampiran terekam di form', true);
  const progresValues = await page.evaluate(() => {
    const arr = window.__progres || [];
    const positif = arr.filter((v) => v > 0);
    return {
      count: arr.length,
      distinctPositive: [...new Set(positif)].length,
      max: Math.max(0, ...arr),
      reachedFull: arr.includes(100),
    };
  });
  check(
    'progres unggahan bergerak bertahap sampai penuh',
    progresValues.count >= 10 && progresValues.distinctPositive >= 5 && progresValues.max >= 90,
    `${progresValues.count} pembaruan, ${progresValues.distinctPositive} nilai berbeda, maks ${progresValues.max}%`
  );
  check('progres pernah mencapai 100%', progresValues.reachedFull);
  const doneBadges = await page.locator('text=Selesai').count();
  check('setiap berkas menampilkan status "Selesai"', doneBadges >= 3, `${doneBadges} badge`);
  check('tombol kirim aktif kembali setelah unggahan selesai', !(await submitBtn.isDisabled()));
  check('ringkasan "3 lampiran siap ikut terkirim"', (await page.locator('text=3 lampiran siap ikut terkirim').count()) > 0);

  // ---- Kirim dan pastikan ketiga lampiran benar-benar tersimpan
  await page.fill('#summary', 'Ringkasan uji unggah ganda.');
  await page.selectOption('#category', { label: 'Teknologi' });
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type('JAKARTA — Uji unggah beberapa footage sekaligus dengan indikator progres.');
  await page.fill('#location', 'Jakarta Pusat');
  await page.selectOption('#province', { label: 'DKI Jakarta' });
  await page.click('button:has-text("Kirim ke Produser")');
  await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 90000 });
  const mediaCount = await page.locator('section:has-text("Footage") >> text=3 lampiran').count();
  check('berita tersimpan dengan 3 lampiran', mediaCount > 0 || (await page.locator('video, img[alt$=".png"]').count()) >= 3);
  const videoEls = await page.locator('video').count();
  check('kedua footage tampil di halaman detail', videoEls >= 2, `${videoEls} video`);

  // ---- Unduh salah satu footage (nama berkas asli)
  const href = await page.locator('a.btn:has-text("Unduh")').first().getAttribute('href');
  const dl = await page.request.get(`${new URL(BASE).origin}${href}`);
  check('footage dari unggahan ganda dapat diunduh', dl.status() === 200, `HTTP ${dl.status()}`);

  // ---- Bersihkan berita uji
  await page.click('button:has-text("Hapus Berita")');
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] button:has-text("Hapus Permanen")');
  await page.waitForTimeout(2500);
} catch (e) {
  check(`exception: ${e.message}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan unggah lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
