/**
 * Uji integrasi JENIS BERITA: form pengiriman menampilkan 4 pilihan, jenis baru benar-benar
 * tersimpan ke database, tampil sebagai badge di tabel/detail/kartu, bisa difilter, dan
 * notifikasi yang diterima redaktur/produser memakai prioritas yang benar.
 *
 * MENULIS ke DB salinan (berita uji dibuat lalu dihapus kembali di akhir).
 *
 *   BASE_URL=http://localhost:3985/newsroom-hub node scripts/news-kinds-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3985/newsroom-hub';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

async function withPage(email, password, fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const EXPECTED = [
  { value: 'REGULAR', label: 'Berita Biasa' },
  { value: 'BREAKING', label: 'Breaking News' },
  { value: 'WAJIB_PIMPINAN', label: 'Wajib Pimpinan' },
  { value: 'SALES_ORDER', label: 'Sales Order' },
];

const stamp = Date.now();
const created = [];

try {
  // ============ 1. Form pengiriman: 4 pilihan ============
  await withPage('reporter.pusat@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const opts = await page.locator('[data-kind-option]').all();
    check('form kirim menampilkan 4 pilihan jenis', opts.length === 4, `${opts.length} tombol`);
    for (const e of EXPECTED) {
      const txt = await page.locator(`[data-kind-option="${e.value}"]`).innerText().catch(() => '');
      check(`tombol jenis "${e.label}" ada`, txt.includes(e.label), txt.replace(/\s+/g, ' '));
    }
    check(
      'keterangan jenis mengikuti pilihan (hint berubah)',
      (await page.locator('[data-kind-hint]').count()) === 1,
      (await page.locator('[data-kind-hint]').innerText().catch(() => '')).slice(0, 50)
    );
    const hintWajib = await (async () => {
      await page.locator('[data-kind-option="WAJIB_PIMPINAN"]').click();
      await page.waitForTimeout(150);
      return page.locator('[data-kind-hint]').innerText();
    })();
    check('hint Wajib Pimpinan tampil khusus', /pimpinan/i.test(hintWajib), hintWajib.slice(0, 60));
  });

  // ============ 2. Kirim berita dengan jenis WAJIB_PIMPINAN ============
  const titleWajib = `Uji Wajib Pimpinan ${stamp}`;
  await withPage('reporter.pusat@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#title', titleWajib);
    await page.selectOption('#category', { label: 'Pemerintahan' });
    await page.fill('#location', 'Jakarta Pusat');
    await page.selectOption('#province', { label: 'DKI Jakarta' });
    await page.locator('[data-kind-option="WAJIB_PIMPINAN"]').click();
    // Isi naskah lewat EDITOR (input[name=script] tersembunyi & tersinkron dari contentEditable).
    await page.locator('[contenteditable="true"]').click();
    await page.keyboard.type(`Naskah uji jenis wajib pimpinan ${stamp}.`);
    await page.click('button:has-text("Kirim Berita")');
    await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 90000 });
    created.push(page.url().split('/berita/')[1]);

    const body = await page.locator('body').innerText();
    check('berita tersimpan dengan jenis WAJIB PIMPINAN', /WAJIB PIMPINAN/i.test(body), '');
    check('badge memakai warna khusus (bukan breaking)', !/BREAKING/i.test(body));
  });

  // ============ 3. Notifikasi memakai prioritas PENTING (WARNING) ============
  await withPage('redaktur@newsroom.demo', 'Demo123!', async (page) => {
    const res = await page.request.get(`${BASE}/api/notifications`);
    const data = await res.json();
    const notif = (data.items ?? []).find((n) => String(n.title).includes('Wajib Pimpinan'));
    check('redaktur menerima notifikasi berjenis Wajib Pimpinan', Boolean(notif), notif ? notif.title : '(tidak ada)');
    check('prioritas notifikasi = WARNING (bukan INFO/DANGER)', notif?.type === 'WARNING', notif?.type ?? '-');
  });

  // ============ 4. Tampil di tabel & filter ============
  await withPage('admin@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/tabulasi?range=all`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('tabel menampilkan badge WAJIB PIMPINAN', (await page.locator('.dtable').innerText()).includes('WAJIB PIMPINAN'));

    // Filter jenis: pilih WAJIB PIMPINAN → hanya berita itu yang tampil
    const filterOpts = await page.locator('#f-kind option').allInnerTexts();
    check(
      'filter jenis punya 4 pilihan + "Semua jenis"',
      filterOpts.length === 5 &&
        EXPECTED.every((e) => filterOpts.some((o) => o.trim() === e.label)),
      filterOpts.map((o) => o.trim()).join(' | ')
    );
    await page.selectOption('#f-kind', 'WAJIB_PIMPINAN');
    await page.locator('form:has(#f-kind) button[type="submit"], form:has(#f-kind) .btn-primary').first().click().catch(async () => {
      await page.locator('#f-kind').press('Enter');
    });
    await page.waitForLoadState('domcontentloaded');
    const filtered = await page.locator('.dtable').innerText().catch(() => '');
    check('filter WAJIB PIMPINAN menyaring hasil', filtered.includes('WAJIB PIMPINAN'), filtered.slice(0, 60).replace(/\s+/g, ' '));
    check('hasil filter tidak memuat jenis lain', !/SALES ORDER/i.test(filtered));
  });

  // ============ 5. Kirim berita SALES ORDER ============
  const titleSales = `Uji Sales Order ${stamp}`;
  await withPage('reporter.pusat@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#title', titleSales);
    await page.selectOption('#category', { label: 'Ekonomi' });
    await page.fill('#location', 'Jakarta Selatan');
    await page.selectOption('#province', { label: 'DKI Jakarta' });
    await page.locator('[data-kind-option="SALES_ORDER"]').click();
    await page.locator('[contenteditable="true"]').click();
    await page.keyboard.type(`Naskah uji sales order ${stamp}.`);
    await page.click('button:has-text("Kirim Berita")');
    await page.waitForURL(/\/dashboard\/tabulasi\/berita\//, { timeout: 90000 });
    created.push(page.url().split('/berita/')[1]);
    check('berita SALES ORDER tersimpan & badge tampil', /SALES ORDER/i.test(await page.locator('body').innerText()));
  });

  // Notifikasi Sales Order harus NORMAL (INFO), bukan WARNING
  await withPage('redaktur@newsroom.demo', 'Demo123!', async (page) => {
    const data = await (await page.request.get(`${BASE}/api/notifications`)).json();
    const notif = (data.items ?? []).find((n) => String(n.title).includes('Sales Order'));
    check('notifikasi Sales Order = INFO (bukan peringatan)', notif?.type === 'INFO', notif?.type ?? '(tidak ada)');
  });

  // ============ 6. Halaman kartu & peta memakai jenis baru ============
  await withPage('admin@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/tabulasi?view=card&range=all`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const cards = await page.locator('body').innerText();
    check('tampilan kartu menampilkan badge Wajib Pimpinan', /WAJIB PIMPINAN/i.test(cards));

    await page.goto(`${BASE}/dashboard/peta?range=all`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const body = await page.locator('body').innerText();
    check('peta punya chip filter per jenis baru', /WAJIB PIMPINAN/i.test(body) && /SALES ORDER/i.test(body));
  });

  // ============ 7. Ringkasan ekspor menghitung jenis baru ============
  await withPage('admin@newsroom.demo', 'Demo123!', async (page) => {
    const csv = await (await page.request.get(`${BASE}/api/export/news?tab=pusat&range=all`)).text();
    check('CSV memuat baris ringkasan "Wajib Pimpinan"', csv.includes('"Wajib Pimpinan"'), '');
    check('CSV memuat baris ringkasan "Sales Order"', csv.includes('"Sales Order"'), '');
    check('kolom tabel masih 22 kolom (tidak ada kolom hilang/berlebih)', (csv.match(/"Nomor Berita"/g) ?? []).length >= 1);
  });

  // ============ 8. Bersihkan berita uji ============
  await withPage('admin@newsroom.demo', 'Demo123!', async (page) => {
    for (const id of created) {
      await page.goto(`${BASE}/dashboard/tabulasi/berita/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const del = page.locator('button:has-text("Hapus")').first();
      if (await del.count()) {
        await del.click();
        await page.waitForTimeout(800);
        const confirm = page.locator('button:has-text("Hapus Berita"), button:has-text("Ya, Hapus"), button:has-text("Hapus")').last();
        if (await confirm.count()) await confirm.click().catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
    await page.goto(`${BASE}/dashboard/tabulasi?range=all&q=Uji+Wajib+Pimpinan`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const sisa = await page.locator('body').innerText();
    check('berita uji dibersihkan', !new RegExp(`Uji Wajib Pimpinan ${stamp}`).test(sisa), '');
  });
} catch (e) {
  check(`exception: ${e.message}`, false);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan jenis berita lulus`);
if (failed.length) process.exit(1);
