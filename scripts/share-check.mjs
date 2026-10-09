/**
 * Uji fitur unduh materi + tautan berbagi untuk TAMU (mis. video editor).
 * Membuktikan: tombol unduh menghasilkan berkas dengan nama asli, tautan tamu
 * dibuat dari newsroom, halaman tamu dapat dibuka TANPA login, tamu dapat
 * pratinjau + unduh, token tidak berlaku untuk berkas lain, dan token palsu/
 * kedaluwarsa ditolak.
 *
 *   BASE_URL=http://localhost:3987/newsroom-hub node scripts/share-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3987/newsroom-hub';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARwAF/gG1F5q9AAAAAElFTkSuQmCC',
  'base64'
);

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

const title = `Uji Berbagi Materi ${Date.now()}`;
let shareUrl = '';
let assetKey = '';
let newsToken = '';

// ============ Bagian 1: newsroom (dengan login) ============
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('#email', 'admin@newsroom.demo');
    await page.fill('#password', 'Demo123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });

    // Buat berita dengan satu lampiran gambar
    await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded' });
    await page.fill('#title', title);
    await page.selectOption('#category', { label: 'Teknologi' });
    await page.locator('[contenteditable="true"]').click();
    await page.keyboard.type('JAKARTA — Uji unduh materi dan tautan berbagi tamu untuk kebutuhan video editor.');
    await page.fill('#location', 'Jakarta Pusat');
    await page.selectOption('#province', { label: 'DKI Jakarta' });
    await page.setInputFiles('input[type="file"]', {
      name: 'footage-editor-uji.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await waitForUpload(page, 'footage-editor-uji.png');
    const storedUrls = await page.evaluate(() => {
      try {
        return JSON.parse(document.querySelector('input[name="media"]')?.value || '[]').map((a) => a.url);
      } catch {
        return [];
      }
    });
    check(
      'lingkungan uji memakai penyimpanan LOKAL (bukan storage produksi)',
      storedUrls.every((u) => String(u).startsWith('local:')),
      storedUrls.join(', ')
    );
    await page.click('button:has-text("Kirim ke Produser")');
    await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 60000 });
    check('berita uji dengan lampiran tersimpan', /\/dashboard\/tabulasi\/berita\//.test(page.url()));

    // --- Fitur unduh di newsroom
    const unduh = page.locator('a.btn', { hasText: 'Unduh' }).first();
    check('tombol "Unduh" tersedia pada lampiran', (await unduh.count()) > 0);
    const unduhHref = await unduh.getAttribute('href');
    check('tautan unduh memuat ?download=1', (unduhHref || '').includes('download=1'), unduhHref ?? '');
    check('tautan unduh memuat nama berkas asli sebagai atribut download', Boolean(await unduh.getAttribute('download')));
    // href sudah memuat basePath -> pakai origin saja (jangan tambah BASE lagi)
    const origin0 = new globalThis.URL(BASE).origin;
    assetKey = decodeURIComponent((/\/api\/media\/(.+?)\?download=1/.exec(unduhHref || '')?.[1] ?? ''));

    const dl = await page.request.get(`${origin0}${unduhHref}`);
    check('unduhan mengembalikan berkas (HTTP 200)', dl.status() === 200, `HTTP ${dl.status()}`);
    const cd = dl.headers()['content-disposition'] || '';
    check('unduhan memakai Content-Disposition attachment', cd.startsWith('attachment'), cd.slice(0, 60));
    check('nama unduhan bebas dari awalan UUID', cd.includes('footage-editor-uji.png'), cd.slice(-60));
    check('unduhan mengirim tipe konten gambar', (dl.headers()['content-type'] || '').includes('image/png'));
    check('unduhan tidak disimpan di cache', (dl.headers()['cache-control'] || '').includes('no-store'));

    // --- Tanpa sesi: API media harus menolak
    const anon = await fetch(`${BASE}/api/media/${assetKey}`, { redirect: 'manual' });
    check('API media menolak tanpa sesi & tanpa token', anon.status === 401, `HTTP ${anon.status}`);

    // --- Bagikan ke tamu (seluruh lampiran berita)
    await page.click('button:has-text("Bagikan ke Tamu")');
    await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
    check('dialog berbagi menampilkan pilihan masa berlaku', (await page.locator('[role="dialog"] input[name="days"]').count()) >= 3);
    check('dialog berisi catatan kedaluwarsa', (await page.locator('text=Setelah kedaluwarsa').count()) > 0);
    await page.locator('[role="dialog"] input[name="days"][value="1"]').check();
    await page.click('[role="dialog"] button:has-text("Buat Tautan Tamu")');
    await page.waitForSelector('text=Tautan siap dibagikan', { timeout: 40000 });
    shareUrl = await page.locator('[role="dialog"] input[readonly]').first().inputValue();
    check('tautan tamu dibuat oleh newsroom', /\/share\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(shareUrl), shareUrl.split('/share/')[1]?.slice(0, 18) + '…');
    check('tautan menyebut masa berlaku 1 hari', (await page.locator('text=berlaku 1 hari').count()) > 0);
    check('tombol "Salin Tautan" tersedia', (await page.locator('[role="dialog"] button:has-text("Salin Tautan")').count()) > 0);
    await page.click('[role="dialog"] button:has-text("Tutup")');

    // --- Tautan per berkas (tombol "Tautan tamu")
    const perAsset = page.locator('button:has-text("Tautan tamu")').first();
    check('tombol "Tautan tamu" tersedia per berkas', (await perAsset.count()) > 0);
    await perAsset.click();
    await page.waitForSelector('text=Tautan berkas dibuat', { timeout: 40000 });
    check('tautan per berkas dibuat', (await page.locator('text=Tautan berkas dibuat').count()) > 0);
    check('tombol salin tautan per berkas muncul', (await page.locator('button:has-text("Salin tautan tamu")').count()) > 0);

    // token dari tautan tamu (untuk uji cakupan)
    newsToken = shareUrl.split('/share/')[1];
  } catch (e) {
    check(`exception (newsroom): ${e.message}`, false);
  } finally {
    await browser.close();
  }
}

// ============ Bagian 2: TAMU (tanpa login sama sekali) ============
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  try {
    await page.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('halaman tamu dapat dibuka TANPA login', (await page.locator('text=Akses Tamu').count()) > 0);
    check('halaman tamu menampilkan judul berita', (await page.locator(`text=${title}`).count()) > 0);
    check('halaman tamu TIDAK menampilkan sidebar dashboard', (await page.locator('a.nav-link').count()) === 0);
    check('halaman tamu menampilkan tombol Unduh', (await page.locator('a.btn:has-text("Unduh")').count()) > 0);
    check('halaman tamu menampilkan tombol Lihat', (await page.locator('a.btn:has-text("Lihat")').count()) > 0);
    check('halaman tamu punya tombol salin tautan berkas', (await page.locator('button:has-text("Salin tautan berkas")').count()) > 0);
    check('halaman tamu mencantumkan masa berlaku', (await page.locator('text=berlaku sampai').count()) > 0);

    // Token tamu tidak boleh mengekspos URL CDN permanen (harus lewat server)
    const guestHref = await page.locator('a.btn:has-text("Lihat")').first().getAttribute('href');
    const guestRes = await fetch(`${new URL(page.url()).origin}${guestHref ?? ''}`, { redirect: 'manual' });
    check(
      'pratinjau tamu dilayani server (tidak dialihkan ke URL CDN publik)',
      guestRes.status === 200 && !guestRes.headers.get('location'),
      `HTTP ${guestRes.status}${guestRes.headers.get('location') ? ` → ${guestRes.headers.get('location')}` : ''}`
    );

    // Pratinjau gambar termuat untuk tamu (fetch tanpa cookie)
    const imgOk = await page.evaluate(async () => {
      const img = document.querySelector('img');
      if (!img) return false;
      const r = await fetch(img.getAttribute('src'));
      return r.status === 200;
    });
    check('tamu dapat memuat pratinjau berkas', imgOk);

    // Unduh dari halaman tamu
    const href = await page.locator('a.btn:has-text("Unduh")').first().getAttribute('href');
    const dl = await fetch(`${new URL(page.url()).origin}${href ?? ''}`);
    check('tamu dapat mengunduh berkas', dl.status === 200, `HTTP ${dl.status}`);
    check(
      'unduhan tamu memakai attachment + nama asli',
      (dl.headers.get('content-disposition') || '').includes('attachment') &&
        (dl.headers.get('content-disposition') || '').includes('footage-editor-uji.png')
    );
  } catch (e) {
    check(`exception (tamu): ${e.message}`, false);
  } finally {
    await browser.close();
  }
}

// ============ Bagian 3: penolakan token (fetch tanpa cookie) ============
{
  const base = BASE.startsWith('http') ? BASE : `http://localhost${BASE}`;
  const tampered = `${newsToken}A`;
  const resTamperedApi = await fetch(`${base}/api/media/${assetKey}?t=${tampered}`, { redirect: 'manual' });
  check('API menolak token yang dimanipulasi', resTamperedApi.status === 401, `HTTP ${resTamperedApi.status}`);

  const resOtherKey = await fetch(`${base}/api/media/2026/01/bukan-milik-berita.png?t=${newsToken}`, { redirect: 'manual' });
  check(
    'token berita TIDAK berlaku untuk berkas lain',
    [403, 404].includes(resOtherKey.status),
    `HTTP ${resOtherKey.status}`
  );

  const resValid = await fetch(`${base}/api/media/${assetKey}?t=${newsToken}`, { redirect: 'manual' });
  check('token sah dapat mengambil berkas tanpa sesi', resValid.status === 200, `HTTP ${resValid.status}`);

  const pageTampered = await fetch(`${base}/share/${tampered}`);
  const htmlTampered = await pageTampered.text();
  check(
    'halaman tamu menolak token palsu/kedaluwarsa',
    pageTampered.status === 200 && htmlTampered.includes('Tautan tidak berlaku lagi')
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan berbagi lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
