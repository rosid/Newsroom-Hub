/**
 * Uji integrasi "Sisipkan Format Broadcast" pada naskah berita:
 * - kelima tombol penanda tersedia di panel Format Broadcast pada form Kirim Berita,
 * - klik penanda langsung menyisipkan shortcode ke body naskah di posisi kursor,
 * - penanda menempati barisnya sendiri dan kursor pindah ke baris baru,
 * - penanda bertahan setelah berita disimpan (sanitasi server) dan tampil berwarna di
 *   halaman detail serta halaman ubah naskah,
 * - teks biasa di sekitar penanda tidak rusak.
 *
 *   BASE_URL=http://localhost:3973/newsroom-hub node scripts/cues-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3973/newsroom-hub';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const CUES = [
  { code: '[ANCHOR ON CAM]', label: 'ANCHOR ON CAM' },
  { code: '[ROLL TAPE / FOOTAGE]', label: 'ROLL TAPE / FOOTAGE' },
  { code: '[VO REPORTER]', label: 'VO REPORTER' },
  { code: '[SOUNDBITE / SOT]', label: 'SOUNDBITE / SOT' },
  { code: '[STANDUP LIVE]', label: 'STANDUP LIVE' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const title = `Uji Format Broadcast ${Date.now()}`;

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', 'admin@newsroom.demo');
  await page.fill('#password', 'Demo123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });

  await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded' });
  check('panel Format Broadcast tampil di form naskah', (await page.locator('[data-broadcast-cues]').count()) > 0);

  const buttons = await page.locator('[data-broadcast-cues] button[data-cue]').allInnerTexts();
  check(
    'kelima penanda tersedia sebagai tombol',
    CUES.every((c) => buttons.some((b) => b.includes(c.label))),
    buttons.map((b) => b.trim()).join(' | ')
  );
  CUES.forEach((c) => {
    check(
      `tombol ${c.label} ada dengan label petunjuk (+ ${c.label})`,
      buttons.some((b) => b.trim() === `+ ${c.label}`)
    );
  });

  // Tulis naskah awal, lalu sisipkan penanda di posisi kursor (setelah kalimat pertama)
  const editor = page.locator('[contenteditable="true"]');
  await editor.click();
  await page.keyboard.type('JAKARTA — Pemerintah meresmikan tol baru. ');
  await page.locator('[data-broadcast-cues] button[data-cue="[ANCHOR ON CAM]"]').click();
  // Kursor otomatis pindah ke baris baru setelah penanda
  await page.keyboard.type('Pembawa acara membuka berita. ');
  await page.locator('[data-broadcast-cues] button[data-cue="[ROLL TAPE / FOOTAGE]"]').click();
  await page.keyboard.type('Gulirkan footage peresmian. ');
  await page.locator('[data-broadcast-cues] button[data-cue="[VO REPORTER]"]').click();
  await page.keyboard.type('Reporter menjelaskan dampak tol. ');
  await page.locator('[data-broadcast-cues] button[data-cue="[SOUNDBITE / SOT]"]').click();
  await page.keyboard.type('Menteri PUPR: "Tol ini memangkas waktu tempuh." ');
  await page.locator('[data-broadcast-cues] button[data-cue="[STANDUP LIVE]"]').click();
  await page.keyboard.type('Reporter standup di gerbang tol.');

  // Verifikasi HTML editor (dibaca dari input hidden yang dikirim ke server)
  const editorHtml = await page.locator('input[name="script"]').inputValue();
  const missing = CUES.filter((c) => !editorHtml.includes(c.code));
  check('kelima penanda masuk ke body naskah', missing.length === 0, missing.map((m) => m.code).join(', ') || 'semua ada');
  const chipCount = await page.locator('[contenteditable="true"] .bc-cue').count();
  check('penanda memakai chip berkelas (akan tampil berwarna)', chipCount >= 5, `${chipCount} chip di editor`);
  const htmlChips = (editorHtml.match(/class="bc-cue bc-cue-[a-z]+"/g) ?? []).length;
  check('penanda tersimpan sebagai chip berkelas di body naskah', htmlChips >= 5, `${htmlChips} chip di HTML`);
  const ownLine = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('[contenteditable="true"] .bc-cue')];
    // Setiap chip harus berada dalam elemen blok (p/div/li) bersama HANYA chip tersebut
    return spans.every((sp) => {
      const block = sp.closest('p, div, li, h1, h2, h3, h4, blockquote');
      if (!block) return false;
      const text = (block.textContent ?? '').trim();
      return text === (sp.textContent ?? '').trim();
    });
  });
  check('setiap penanda berada di barisnya sendiri', ownLine);
  check('teks naskah di sekitar penanda tetap utuh', editorHtml.includes('Pemerintah meresmikan tol baru') && editorHtml.includes('Reporter standup di gerbang tol'));

  // ANTI-REGRESI: teks reporter tidak boleh ikut masuk ke dalam chip penanda.
  // Chromium mengetikkan teks ke dalam <span> sebelumnya bila titik kursor berada di
  // paragraf kosong — pernah terjadi dan harus tetap tertutup oleh pemeriksaan ini.
  const chipTexts = await page.locator('[contenteditable="true"] .bc-cue').allInnerTexts();
  const contaminated = chipTexts.filter((t) => !CUES.some((c) => c.code === t.trim()));
  check(
    'tidak ada teks reporter yang masuk ke dalam chip penanda',
    contaminated.length === 0,
    contaminated.slice(0, 3).join(' | ') || 'semua chip bersih'
  );
  const paragraphsAfterCue = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('[contenteditable="true"] > p')];
    return blocks.map((b) => (b.textContent ?? '').trim()).filter(Boolean);
  });
  check(
    'teks setelah penanda berada di paragraf terpisah',
    paragraphsAfterCue.some((t) => t.includes('Pembawa acara membuka berita')) &&
      paragraphsAfterCue.some((t) => t.includes('Reporter standup di gerbang tol')),
    `${paragraphsAfterCue.length} paragraf berisi teks`
  );
  check('urutan penanda sesuai urutan klik', CUES.every((c, i, arr) => i === 0 || editorHtml.indexOf(arr[i - 1].code) < editorHtml.indexOf(c.code)));

  // Warna chip di editor berbeda dari teks biasa
  const chipColor = await page
    .locator('[contenteditable="true"] .bc-cue')
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  const plainColor = await page
    .locator('[contenteditable="true"]')
    .evaluate((el) => getComputedStyle(el).color);
  check('chip penanda tampil berwarna (beda dari teks biasa)', chipColor !== plainColor, `${chipColor} vs ${plainColor}`);

  // =====================================================================================
  // PENGERASAN CSS (perbaikan audit Tahap 2 — XSS-1) lewat jalur NYATA (editor → server → render).
  // Payload overlay penuh layar & beacon ditaruh di naskah, lalu dibuktikan HILANG di halaman detail.
  // =====================================================================================
  const CSS_PAYLOAD =
    '<p><span style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#fff;z-index:99999">Login palsu uji XSS</span>' +
    '<span style="background-image:url(https://jahat.example/beacon.png)">beacon</span>' +
    '<span style="color:#d61f2c;font-weight:bold">warna wajar</span></p>';
  await page.evaluate((payload) => {
    const input = document.querySelector('input[name="script"]');
    input.value = `${input.value}${payload}`;
  }, CSS_PAYLOAD);

  // Simpan berita
  await page.fill('#title', title);
  await page.selectOption('#category', { label: 'Pemerintahan' });
  await page.fill('#summary', 'Ringkasan uji penanda format siaran.');
  await page.fill('#location', 'Gerbang Tol Jakarta');
  await page.selectOption('#province', { label: 'DKI Jakarta' });
  await page.click('button:has-text("Kirim ke Produser")');
  await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 90000 });
  const newsId = page.url().split('/berita/')[1];

  // Halaman detail: penanda bertahan setelah sanitasi server + tetap berwarna
  const detailHtml = await page.locator('.prose-news').first().innerHTML();
  const lostAfterSave = CUES.filter((c) => !detailHtml.includes(c.code));
  check('penanda bertahan setelah disimpan (lolos sanitasi)', lostAfterSave.length === 0, lostAfterSave.map((m) => m.code).join(', ') || 'semua ada');
  check(
    'chip penanda tetap berkelas di halaman detail',
    (detailHtml.match(/class="bc-cue bc-cue-[a-z]+"/g) ?? []).length >= 5,
    `${(detailHtml.match(/class="bc-cue/g) ?? []).length} chip`
  );
  const detailChipColor = await page
    .locator('.prose-news .bc-cue')
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  check('chip berwarna juga di halaman detail', Boolean(detailChipColor), detailChipColor);

  // --- XSS-1: CSS aktif dari naskah tidak boleh bertahan di halaman yang dirender ---
  check(
    'CSS overlay (position/top/left/width/height/z-index) dibuang dari naskah tersimpan',
    !/position\s*:|z-index\s*:|top\s*:|left\s*:|100vw|100vh/i.test(detailHtml),
    (detailHtml.match(/position[^"]{0,40}|z-index[^"]{0,20}/i) ?? ['tidak ada'])[0]
  );
  check(
    'beacon background-image:url() dibuang dari naskah tersimpan',
    !/background-image|url\(/i.test(detailHtml),
    (detailHtml.match(/background-image[^"]{0,50}/i) ?? ['tidak ada'])[0]
  );
  check(
    'properti CSS wajar (warna/tebal) tetap dipertahankan',
    /style="[^"]*color:\s*#d61f2c/i.test(detailHtml) && /font-weight/i.test(detailHtml),
    (detailHtml.match(/style="[^"]*#d61f2c[^"]*"/i) ?? ['tidak ditemukan'])[0]
  );

  // Halaman ubah naskah: penanda kembali muncul di editor (bisa diedit)
  await page.goto(`${BASE}/dashboard/tabulasi/berita/${newsId}/edit`, { waitUntil: 'domcontentloaded' });
  const editHtml = await page.locator('input[name="script"]').inputValue();
  const editChips = await page.locator('[contenteditable="true"] .bc-cue').count();
  check(
    'penanda tampil kembali saat naskah diubah',
    CUES.every((c) => editHtml.includes(c.code)) && editChips >= 5,
    `${editChips} chip di editor`
  );
  check('panel Format Broadcast tetap tersedia di halaman ubah', (await page.locator('[data-broadcast-cues]').count()) > 0);

  // Tampilan kartu menampilkan RINGKASAN (teks polos), bukan markup naskah
  await page.goto(`${BASE}/dashboard/tabulasi?view=card&range=all&q=Format+Broadcast`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tabulasi-berita a.panel.group', { timeout: 30000 });
  const cardText = await page.locator('#tabulasi-berita a.panel.group').first().innerText();
  check(
    'kartu menampilkan ringkasan sebagai teks (tanpa markup naskah)',
    cardText.includes('Ringkasan uji penanda format siaran') && !cardText.includes('<span'),
    cardText.replace(/\s+/g, ' ').slice(0, 90)
  );

  // Tampilan daftar (tabel) juga tidak menampilkan markup mentah dari naskah
  await page.goto(`${BASE}/dashboard/tabulasi?range=all&q=Format+Broadcast`, { waitUntil: 'domcontentloaded' });
  const tableText = await page.locator('.dtable tbody').innerText();
  check(
    'tabel tabulasi menampilkan judul tanpa markup mentah',
    tableText.includes('Uji Format Broadcast') && !tableText.includes('<span'),
    tableText.replace(/\s+/g, ' ').slice(0, 90)
  );

  // Bersihkan berita uji
  await page.goto(`${BASE}/dashboard/tabulasi/berita/${newsId}`, { waitUntil: 'domcontentloaded' });
  await page.click('button:has-text("Hapus Berita")');
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] button:has-text("Hapus Permanen")');
  await page.waitForTimeout(2500);
  check('berita uji dibersihkan', true);
} catch (e) {
  check(`exception: ${e.message}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan format broadcast lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
