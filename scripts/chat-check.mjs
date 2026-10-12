/**
 * Uji integrasi fitur chat:
 * - klaster terlihat benar (daftar kontak & percakapan),
 * - penolakan lintas biro & lintas klaster (UI + API),
 * - kirim teks & emoticon, tanpa dukungan gambar,
 * - edit hanya dalam 60 detik (dan hanya oleh pengirimnya),
 * - TIDAK ada hapus pesan (tombol tidak ada, metode DELETE 405),
 * - badge belum dibaca bertambah lalu hilang setelah dibaca.
 *
 *   BASE_URL=http://localhost:3975/newsroom-hub node scripts/chat-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3975/newsroom-hub';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

/** Login memakai browser terpisah agar bisa memeriksa antar-akun (batas 1 tab per instance). */
async function withPage(email, fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#email', email);
    await page.fill('#password', 'Demo123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const api = async (page, path, init) => {
  const res = await page.request.fetch(`${new URL(BASE).origin}${BASE.replace(/^https?:\/\/[^/]+/, '')}${path}`, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* bukan JSON */
  }
  return { status: res.status(), body };
};

try {
  // ============ 1. Reporter Daerah (Medan): kontak & klaster ============
  const reporterMedan = {};
  await withPage('reporter.medan@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    check('menu Chat tersedia di sidebar', (await page.locator('a.nav-link:has-text("Chat")').count()) > 0);
    check('halaman chat menampilkan aturan klaster', (await page.locator('text=Klaster 1 · Biro Daerah').count()) > 0);

    const contacts = await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts();
    const text = contacts.join(' | ');
    check('kontak hanya Produser Daerah biro sendiri (Medan)', text.includes('Produser Daerah') && text.includes('Medan'), text.slice(0, 90));
    check('kontak TIDAK memuat Produser Surabaya', !text.includes('Surabaya'));
    check('kontak TIDAK memuat role pusat', !/Produser Pusat|Koordinator|Reporter Pusat/.test(text));
    check('percakapan dari fixture tampil', (await page.locator('section:has-text("Percakapan") li').count()) >= 1);

    // Buka percakapan dengan Produser Medan
    await page.locator('section:has-text("Percakapan") a').first().click();
    await page.waitForURL(/\/dashboard\/chat\//, { timeout: 40000 });
    reporterMedan.url = page.url();
    reporterMedan.conversationId = page.url().split('/chat/')[1];

    check('halaman chat menyebut aturan teks/emoticon & tanpa hapus', (await page.locator('text=pesan tidak dapat dihapus').count()) > 0);
    check('TIDAK ada tombol hapus pesan', (await page.locator('button:has-text("Hapus")').count()) === 0);
    check('TIDAK ada input unggah berkas/gambar di chat', (await page.locator('input[type="file"]').count()) === 0);
    check('pemilih emoticon tersedia', (await page.locator('button:has-text("Emoticon")').count()) > 0);

    // Kirim pesan teks + emoticon
    const stamp = Date.now();
    const message = `Uji chat ${stamp} — naskah banjir siap dikirim 👍`;
    await page.fill('textarea.textarea', message);
    await page.click('button:has-text("Kirim")');
    await page.waitForSelector(`text=Uji chat ${stamp}`, { timeout: 40000 });
    check('pesan teks + emoticon terkirim', true);
    check('pesan menampilkan status terkirim', (await page.locator('text=terkirim').count()) >= 1);

    // Tombol Edit muncul (dalam 60 detik) dan bisa dipakai.
    // Tunggu eksplisit dulu agar tidak balapan dengan render React setelah kirim.
    const editBtn = page.locator('button:has-text("Edit (")').last();
    const editAppeared = await page
      .waitForSelector('button:has-text("Edit (")', { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check('tombol Edit muncul untuk pesan sendiri (< 60 detik)', editAppeared && (await editBtn.count()) > 0);
    await editBtn.click();
    const editArea = page.locator('textarea.textarea').last();
    await editArea.fill(`Uji chat ${stamp} — DIEDIT, naskah banjir sudah dikirim ke produser ✅`);
    await page.click('button:has-text("Simpan")');
    await page.waitForSelector(`text=DIEDIT`, { timeout: 40000 });
    check('pesan berhasil diedit', (await page.locator('text=DIEDIT').count()) > 0);
    check('penanda "diedit" tampil', (await page.locator('text=diedit').count()) > 0);

    // Kirim pesan kedua untuk uji batas 60 detik di API + uji "bukan pengirim"
    await page.fill('textarea.textarea', `Pesan kedua ${stamp}`);
    await page.click('button:has-text("Kirim")');
    await page.waitForSelector(`text=Pesan kedua ${stamp}`, { timeout: 40000 });

    // Simpan id pesan terbaru lewat API (ambil daftar pesan)
    const list = await api(page, `/api/chat/${reporterMedan.conversationId}`);
    check('API GET pesan milik peserta sendiri berhasil', list.status === 200 && Array.isArray(list.body?.messages), `HTTP ${list.status}`);
    reporterMedan.messages = list.body?.messages ?? [];
    const mine = reporterMedan.messages.filter((m) => m.mine);
    reporterMedan.lastMine = mine[mine.length - 1];
    check('metadata pesan memuat waktu & status edit', Boolean(reporterMedan.lastMine?.createdAt));

    // Edit lewat API: pesan sendiri dalam 60 detik → boleh
    const editOk = await api(page, `/api/chat/${reporterMedan.conversationId}`, {
      method: 'PATCH',
      data: { messageId: reporterMedan.lastMine.id, body: `Pesan kedua ${stamp} (diedit via API)` },
    });
    check('API PATCH mengizinkan edit pesan sendiri < 60 detik', editOk.status === 200 && editOk.body?.ok, `HTTP ${editOk.status}`);

    // Tidak ada endpoint hapus
    const del = await api(page, `/api/chat/${reporterMedan.conversationId}`, { method: 'DELETE' });
    check('API DELETE tidak tersedia (pesan tidak dapat dihapus)', [404, 405].includes(del.status), `HTTP ${del.status}`);
  });

  // ============ 2. Produser Medan: klaster 1 dua arah ============
  await withPage('produser.medan@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const contacts = (await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts()).join(' | ');
    check('Produser Medan melihat Reporter Daerah biro sendiri', contacts.includes('Reporter Daerah') && contacts.includes('Medan'), contacts.slice(0, 80));
    check('Produser Medan melihat semua Koordinator Daerah (klaster 3)', /Koordinator Daerah/.test(contacts));
    check('Produser Medan TIDAK melihat Koordinator Liputan (beda klaster)', !contacts.includes('Koordinator Liputan'));
    check('Produser Medan TIDAK melihat Reporter Medan biro lain', !contacts.includes('Surabaya'));

    // Badge belum dibaca (pesan dari reporter)
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    const badge = await page.locator('a.nav-link:has-text("Chat") .badge').count();
    check('badge unread chat muncul di sidebar', badge >= 1);

    // Lintas biro & lintas klaster ditolak di API
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const ids = await page.evaluate(async () => {
      const res = await fetch(`${location.pathname.replace(/\/dashboard.*/, '')}/api/chat/__probe`, { method: 'GET' });
      return res.status;
    });
    check('API menolak percakapan asing/tidak dikenal', [403, 404].includes(ids), `HTTP ${ids}`);

    // Buka percakapan & pastikan edit orang lain ditolak
    await page.locator('section:has-text("Percakapan") a').first().click();
    await page.waitForURL(/\/dashboard\/chat\//, { timeout: 40000 });
    const convId = page.url().split('/chat/')[1];
    const list = await api(page, `/api/chat/${convId}`);
    const notMine = (list.body?.messages ?? []).find((m) => !m.mine);
    if (notMine) {
      const editOther = await api(page, `/api/chat/${convId}`, {
        method: 'PATCH',
        data: { messageId: notMine.id, body: 'Percobaan mengubah pesan orang lain' },
      });
      check('API PATCH menolak edit pesan orang lain (403)', editOther.status === 403, `HTTP ${editOther.status}`);
    } else {
      check('API PATCH menolak edit pesan orang lain (403)', false, 'tidak ada pesan orang lain');
    }
  });

  // ============ 3. Pesan lama (> 60 detik) dari fixture tidak bisa diedit ============
  await withPage('reporter.medan@newsroom.demo', async (page) => {
    const list = await api(page, `/api/chat/${reporterMedan.conversationId}`);
    const old = (list.body?.messages ?? []).find((m) => m.mine && m.body.includes('Pesan lama'));
    if (old) {
      const res = await api(page, `/api/chat/${reporterMedan.conversationId}`, {
        method: 'PATCH',
        data: { messageId: old.id, body: 'Mencoba mengedit pesan lama' },
      });
      check('API PATCH menolak edit pesan > 60 detik (403)', res.status === 403, `HTTP ${res.status}`);
    } else {
      check('API PATCH menolak edit pesan > 60 detik (403)', false, 'pesan lama tidak ditemukan');
    }

    // Pesan lama tidak menampilkan tombol Edit di UI
    await page.goto(`${BASE}/dashboard/chat/${reporterMedan.conversationId}`, { waitUntil: 'domcontentloaded' });
    const oldRow = page.locator('div:has-text("Pesan lama")').last();
    check('pesan lama tidak menawarkan tombol Edit', (await oldRow.locator('button:has-text("Edit")').count()) === 0);
    check('pesan lama menandai batas edit lewat', (await page.locator('text=batas edit lewat').count()) > 0);
  });

  // ============ 4. Klaster 2 (pusat) & Klaster 3 (koordinasi daerah) ============
  await withPage('reporter.pusat@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const contacts = (await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts()).join(' | ');
    // ALUR BARU (Okt 2026): Reporter Pusat → Koordinator Liputan → Produser Pusat.
    check('Reporter Pusat melihat Koordinator Liputan', contacts.includes('Koordinator Liputan'), contacts.slice(0, 80));
    check('Reporter Pusat TIDAK melihat Produser Pusat (harus lewat Koordinator Liputan)', !/Produser Pusat/.test(contacts));
    check('Reporter Pusat TIDAK melihat role daerah', !/Produser Daerah|Koordinator Daerah|Reporter Daerah/.test(contacts));
    check('Reporter Pusat TIDAK melihat Admin/Redaktur', !/Admin Redaksi|Redaktur/.test(contacts));
  });

  await withPage('koordinator.liputan@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const contacts = (await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts()).join(' | ');
    check('Koordinator Liputan berada di klaster pusat', contacts.includes('Reporter Pusat') && contacts.includes('Produser Pusat'), contacts.slice(0, 80));
    // Hak akses setara Produser Pusat: bisa melihat tabulasi pusat & menunggu persetujuan
    await page.goto(`${BASE}/dashboard/tabulasi`, { waitUntil: 'domcontentloaded' });
    const tabs = (await page.locator('.tab').allInnerTexts()).join(' | ');
    check('hak akses tabulasi setara Produser Pusat (pool pusat, tanpa tab daerah)', tabs.includes('Tabulasi Pusat') && !tabs.includes('Tabulasi Daerah'), tabs);
  });

  await withPage('koordinator.daerah@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const contacts = (await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts()).join(' | ');
    check('Koordinator Daerah melihat Produser Daerah semua biro', contacts.includes('Medan') && contacts.includes('Surabaya'), contacts.slice(0, 100));
    check('Koordinator Daerah TIDAK melihat Reporter Daerah', !contacts.includes('Reporter Daerah'));
    // Alur baru: Koordinator Daerah adalah perantara ke Produser Pusat, dan menerima Kontributor.
    check('Koordinator Daerah melihat Produser Pusat (lanjutan alur ke pusat)', /Produser Pusat/.test(contacts), contacts.slice(0, 120));
    check('Koordinator Daerah melihat Kontributor (alur baru)', /Kontributor/.test(contacts), contacts.slice(0, 120));
    await page.goto(`${BASE}/dashboard/tabulasi`, { waitUntil: 'domcontentloaded' });
    const tabs = (await page.locator('.tab').allInnerTexts()).join(' | ');
    check('hak akses tabulasi Koordinator Daerah setara Produser Pusat', tabs.includes('Tabulasi Pusat') && !tabs.includes('Tabulasi Daerah'), tabs);
  });

  // ============ 5. Redaktur: dichat Produser & Koordinator ============
  await withPage('redaktur@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const contacts = (await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts()).join(' | ');
    const expectedCallers = ['Produser Pusat', 'Produser Daerah', 'Koordinator Liputan', 'Koordinator Daerah'];
    check(
      'Redaktur melihat Produser Pusat, Produser Daerah, Koordinator Liputan & Koordinator Daerah',
      expectedCallers.every((r) => contacts.includes(r)),
      contacts.replace(/\s+/g, ' ').slice(0, 110)
    );
    check(
      'Redaktur TIDAK melihat Reporter/Kontributor/Magang/Admin',
      !/Reporter Pusat|Reporter Daerah|Kontributor|Magang|Admin Redaksi|Super Admin/.test(contacts)
    );
    check('halaman chat Redaktur menampilkan aturan eskalasi', (await page.locator('text=Eskalasi ke Redaktur').count()) > 0);
  });

  // ============ 6. Admin: dichat Produser & Koordinator ============
  await withPage('admin@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const contacts = (await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts()).join(' | ');
    const expectedCallers = ['Produser Pusat', 'Produser Daerah', 'Koordinator Liputan', 'Koordinator Daerah'];
    check(
      'Admin melihat keempat role Produser/Koordinator',
      expectedCallers.every((r) => contacts.includes(r)),
      contacts.replace(/\s+/g, ' ').slice(0, 110)
    );
    check(
      'Admin TIDAK melihat Reporter/Kontributor/Magang/Redaktur',
      !/Reporter Pusat|Reporter Daerah|Kontributor|Magang|Redaktur/.test(contacts)
    );
    check('halaman chat Admin menampilkan aturan eskalasi', (await page.locator('text=Eskalasi ke Redaktur / Admin / Super Admin').count()) > 0);
  });

  // ============ 7. Kontributor: Koordinator Daerah (alur baru Okt 2026) ============
  await withPage('kontributor.bandung@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const contacts = (await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts()).join(' | ');
    check('Kontributor melihat Koordinator Daerah (alur baru)', contacts.includes('Koordinator Daerah'), contacts.replace(/\s+/g, ' ').slice(0, 90));
    check(
      'Kontributor TIDAK melihat Koordinator Liputan (dialihkan ke Koordinator Daerah)',
      !/Koordinator Liputan/.test(contacts),
      contacts.replace(/\s+/g, ' ').slice(0, 90)
    );
    check(
      'Kontributor TIDAK melihat Produser/Reporter/Magang',
      !/Produser Pusat|Produser Daerah|Reporter|Magang/.test(contacts)
    );
  });

  // ============ 8. Magang di biro: Koordinator Liputan + Produser Daerah biro sama ============
  await withPage('magang.makassar@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const contacts = (await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts()).join(' | ');
    check('Magang Makassar melihat Koordinator Liputan', contacts.includes('Koordinator Liputan'), contacts.replace(/\s+/g, ' ').slice(0, 110));
    check('Magang Makassar melihat Produser Daerah biro sendiri (Makassar)', contacts.includes('Makassar'), contacts.replace(/\s+/g, ' ').slice(0, 110));
    check('Magang Makassar TIDAK melihat Produser biro lain', !/Medan|Surabaya/.test(contacts));
  });
  // ============ 8b. Alur baru: Produser Pusat (Reporter Pusat lewat Koordinator Liputan) ============
  await withPage('produser.pusat@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const contacts = (await page.locator('section:has-text("Kontak Klaster Anda") li').allInnerTexts()).join(' | ');
    check('Produser Pusat melihat Koordinator Liputan (alur pusat)', /Koordinator Liputan/.test(contacts), contacts.slice(0, 90));
    check('Produser Pusat TIDAK melihat Reporter Pusat (harus lewat Koordinator Liputan)', !/Reporter Pusat/.test(contacts), contacts.slice(0, 90));
    check('Produser Pusat melihat Koordinator Daerah (lanjutan alur dari biro)', /Koordinator Daerah/.test(contacts), contacts.slice(0, 90));
  });

  // ============ 9. Alur dua arah relasi baru: Produser Pusat ↔ Redaktur ============
  await withPage('produser.pusat@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('section:has-text("Kontak Klaster Anda") li', { hasText: 'Redaktur' }).first();
    check('Produser Pusat melihat Redaktur sebagai kontak', (await row.count()) > 0);
    await row.locator('button:has-text("Chat"), button:has-text("Buka")').first().click();
    await page.waitForURL(/\/dashboard\/chat\//, { timeout: 40000 });
    const convUrl = page.url();
    const stamp2 = Date.now();
    await page.fill('textarea.textarea', `Koordinasi ke redaktur ${stamp2}`);
    await page.click('button:has-text("Kirim")');
    await page.waitForSelector(`text=Koordinasi ke redaktur ${stamp2}`, { timeout: 40000 });
    check('Produser Pusat dapat mengirim pesan ke Redaktur', true);

    // Redaktur membalas pada percakapan yang sama
    const convId = convUrl.split('/chat/')[1];
    globalThis.__escalationConvId = convId;
    globalThis.__escalationStamp = stamp2;
  });

  await withPage('redaktur@newsroom.demo', async (page) => {
    await page.goto(`${BASE}/dashboard/chat/${globalThis.__escalationConvId}`, { waitUntil: 'domcontentloaded' });
    check(
      'Redaktur dapat membuka percakapan dari Produser Pusat',
      (await page.locator(`text=Koordinasi ke redaktur ${globalThis.__escalationStamp}`).count()) > 0
    );
    await page.fill('textarea.textarea', 'Diterima, naskah masuk jadwal ✅');
    await page.click('button:has-text("Kirim")');
    await page.waitForSelector('text=Diterima, naskah masuk jadwal', { timeout: 40000 });
    check('Redaktur dapat membalas (dua arah)', (await page.locator('text=Diterima, naskah masuk jadwal').count()) > 0);
  });

  // ============ 10. Penolakan SERVER untuk pasangan di luar aturan ============
  // Percakapan Produser Pusat ↔ Reporter Daerah dibuat langsung di DB (di luar UI),
  // lalu API harus menolak karena pasangan ini tidak diizinkan aturan.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const pusat = await prisma.user.findFirst({ where: { email: 'produser.pusat@newsroom.demo' }, select: { id: true } });
    const reporterDaerah = await prisma.user.findFirst({ where: { email: 'reporter.medan@newsroom.demo' }, select: { id: true } });
    const [a, b] = pusat.id < reporterDaerah.id ? [pusat.id, reporterDaerah.id] : [reporterDaerah.id, pusat.id];
    const conv = await prisma.conversation.upsert({
      where: { participant1Id_participant2Id: { participant1Id: a, participant2Id: b } },
      update: {},
      create: { id: `UJI-CHAT-FORBIDDEN-${Date.now()}`, participant1Id: a, participant2Id: b },
      select: { id: true },
    });
    await withPage('produser.pusat@newsroom.demo', async (page) => {
      const res = await api(page, `/api/chat/${conv.id}`);
      check('API menolak percakapan pasangan di luar aturan (403)', res.status === 403, `HTTP ${res.status}`);
      const post = await api(page, `/api/chat/${conv.id}`, { method: 'POST', data: { body: 'Percobaan mengirim ke pasangan terlarang' } });
      check('API menolak KIRIM pesan ke pasangan di luar aturan (403)', post.status === 403, `HTTP ${post.status}`);
      // Percakapan terlarang juga tidak muncul di daftar
      await page.goto(`${BASE}/dashboard/chat`, { waitUntil: 'domcontentloaded' });
      const listed = await page.locator('section:has-text("Percakapan") a').allInnerTexts();
      check(
        'percakapan di luar aturan disembunyikan dari daftar',
        !listed.some((t) => t.includes('Reporter Daerah') && t.includes('Medan')),
        `${listed.length} percakapan`
      );
    });
    await prisma.conversation.delete({ where: { id: conv.id } }).catch(() => {});
  } finally {
    await prisma.$disconnect();
  }
} catch (e) {
  check(`exception: ${e.message}`, false);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan chat lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
