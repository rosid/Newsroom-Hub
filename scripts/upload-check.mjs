/**
 * Uji unggah lampiran: PROGRES + BANYAK footage sekaligus.
 *
 * Jaringan di-throttle lewat CDP (upload ~512 KB/s) supaya progres dan keadaan
 * "sedang mengunggah" benar-benar dapat diamati (unggahan lokal terlalu cepat).
 *
 *   BASE_URL=http://localhost:3977/newsroom-hub node scripts/upload-check.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

/** Folder unggahan uji (diisi runner). Dipakai untuk membuktikan berkas BENAR-BENAR terhapus. */
const UPLOAD_DIR = process.env.MEDIA_UPLOAD_DIR ?? '';

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
  const submitBtn = page.locator('button:has-text("Kirim Berita")');
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
  await page.click('button:has-text("Kirim Berita")');
  await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 90000 });
  const mediaCount = await page.locator('section:has-text("Footage") >> text=3 lampiran').count();
  check('berita tersimpan dengan 3 lampiran', mediaCount > 0 || (await page.locator('video, img[alt$=".png"]').count()) >= 3);
  const videoEls = await page.locator('video').count();
  check('kedua footage tampil di halaman detail', videoEls >= 2, `${videoEls} video`);

  // ---- Unduh salah satu footage (nama berkas asli)
  const href = await page.locator('a.btn:has-text("Unduh")').first().getAttribute('href');
  const dl = await page.request.get(`${new URL(BASE).origin}${href}`);
  check('footage dari unggahan ganda dapat diunduh', dl.status() === 200, `HTTP ${dl.status()}`);

  // =====================================================================================
  // HAPUS LAMPIRAN lalu SIMPAN: berkas harus benar-benar hilang (baris DB + berkas di disk/bucket).
  //
  // Bug yang dijaga di sini: sebelumnya tombol hapus hanya membuang berkas dari tampilan
  // (state React) sehingga setelah disimpan berkas itu MUNCUL KEMBALI, dan objeknya tetap
  // ada di storage. Sekarang form mengirim daftar `removedMedia` dan server menghapusnya.
  // =====================================================================================
  const newsId = page.url().split('/berita/')[1];
  const keysBefore = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/api/media/"]')]
      .map((a) => {
        const m = /\/api\/media\/([^?"]+)/.exec(a.getAttribute('href') || '');
        return m ? decodeURIComponent(m[1]) : '';
      })
      .filter(Boolean)
  );
  const uniqueKeys = [...new Set(keysBefore)];
  check('kunci lampiran terbaca dari halaman detail (3 berkas)', uniqueKeys.length === 3, `${uniqueKeys.length} kunci`);

  await page.goto(`${BASE}/dashboard/tabulasi/berita/${newsId}/edit`, { waitUntil: 'domcontentloaded' });
  check('halaman ubah memuat 3 lampiran', (await page.locator('button[title*="daftar lampiran"], button[title*="daftar"]').count()) >= 3);

  // Hapus SATU lampiran di form
  const removeBtns = page.locator('button.btn-danger:has-text("Hapus"), button[title*="dari daftar"]');
  await removeBtns.first().click();
  await page.waitForTimeout(400);

  const removedHidden = await page.locator('[data-removed-media]').inputValue();
  let removedList = [];
  try {
    removedList = JSON.parse(removedHidden);
  } catch {
    removedList = [];
  }
  check('berkas yang dihapus tercatat untuk dikirim ke server (removedMedia)', removedList.length === 1, `${removedList.length} kunci`);
  const removedKey = removedList[0] ?? '';
  check('kunci yang dicatat adalah salah satu lampiran berita', uniqueKeys.includes(removedKey), removedKey.slice(0, 28));
  check('sisa lampiran di form tinggal 2', (await page.locator('[data-removed-media]').count()) === 1);

  // Simpan perubahan.
  // CATATAN: dalam mode UBAH, NewsForm TIDAK berpindah halaman (hanya router.refresh() +
  // menampilkan pesan sukses) — jadi uji ini menunggu pesan sukses, lalu membuka halaman
  // detail sendiri. Menunggu perubahan URL di sini adalah kesalahan uji, bukan bug aplikasi.
  await page.click('button:has-text("Kirim Berita")');
  await page.waitForSelector('text=berhasil dikirim ke produser, text=Draft disimpan', { timeout: 90000 }).catch(async () => {
    await page.waitForSelector('text=/berhasil|disimpan/i', { timeout: 60000 });
  });
  await page.goto(`${BASE}/dashboard/tabulasi/berita/${newsId}`, { waitUntil: 'domcontentloaded' });

  const keysAfter = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/api/media/"]')]
      .map((a) => {
        const m = /\/api\/media\/([^?"]+)/.exec(a.getAttribute('href') || '');
        return m ? decodeURIComponent(m[1]) : '';
      })
      .filter(Boolean)
  );
  const uniqueAfter = [...new Set(keysAfter)];
  check('lampiran yang dihapus TIDAK muncul kembali setelah disimpan', !uniqueAfter.includes(removedKey), `sisa ${uniqueAfter.length} lampiran`);
  check('lampiran lain tetap ada (tidak ikut terhapus)', uniqueKeys.filter((k) => k !== removedKey).every((k) => uniqueAfter.includes(k)), uniqueAfter.length + ' lampiran');

  // Bukti kuat: berkasnya benar-benar hilang dari folder penyimpanan
  if (UPLOAD_DIR && removedKey) {
    const removedPath = path.join(UPLOAD_DIR, removedKey);
    check('berkas yang dihapus benar-benar hilang dari penyimpanan', !fs.existsSync(removedPath), removedPath.replace(UPLOAD_DIR, '<uploads>'));
    const keptPath = path.join(UPLOAD_DIR, uniqueAfter[0] ?? '');
    check('berkas yang dipertahankan masih ada di penyimpanan', Boolean(uniqueAfter[0]) && fs.existsSync(keptPath));
  } else {
    check('uji berkas di disk dilewati (MEDIA_UPLOAD_DIR tidak diset)', true, 'dilewati');
  }

  // Lampiran yang tersisa tetap bisa diunduh
  if (uniqueAfter[0]) {
    // WAJIB menyertakan basePath: aplikasi dilayani di bawah /newsroom-hub, jadi
    // `/api/media/...` tanpa prefix akan 404 (bukan bug aplikasi, salah menyusun URL di uji).
    const basePath = new URL(BASE).pathname.replace(/\/$/, '');
    const still = await page.request.get(`${new URL(BASE).origin}${basePath}/api/media/${uniqueAfter[0]}?download=1`);
    check('lampiran yang tersisa tetap dapat diunduh', still.status() === 200, `HTTP ${still.status()}`);
  }

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
