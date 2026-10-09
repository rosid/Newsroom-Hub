/**
 * Uji fitur: Produser Daerah boleh membuat & mengelola akun Reporter Daerah/Magang
 * di BIRO-NYA SENDIRI, sekaligus membuktikan batasannya ditegakkan server.
 *
 *   BASE_URL=http://localhost:3966/newsroom-hub node scripts/bureau-user-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3966/newsroom-hub';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

/** Login memakai browser terpisah (batas 1 tab per instance). */
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

/**
 * Ambil id akun dari halaman Pengguna (dipakai untuk uji "paksa sasaran" — memastikan
 * penegakan ada di SERVER, bukan hanya disembunyikan di UI).
 */
async function findUserId(page, email) {
  const basePath = new URL(BASE).pathname.replace(/\/$/, '');
  return page.evaluate(
    async ([path, target]) => {
      const res = await fetch(`${path}/dashboard/pengaturan/pengguna`, { headers: { accept: 'text/html' } });
      const html = await res.text();
      const row = html.split('<tr').find((r) => r.includes(target)) || '';
      const m = /\/dashboard\/pengaturan\/pengguna\/([0-9a-f-]{36})/.exec(row);
      return m ? m[1] : '';
    },
    [basePath, email]
  );
}

const stamp = Date.now();
const newReporter = `reporter.uji.${stamp}@newsroom.demo`;
const newIntern = `magang.uji.${stamp}@newsroom.demo`;
const newContributor = `kontributor.uji.${stamp}@newsroom.demo`;
const initialPassword = 'AwalUji2026!';

try {
  // ============ 1. Produser Biro Medan: buat akun Reporter Daerah & Magang ============
  await withPage('produser.medan@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna-biro`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    check('Produser Daerah dapat membuka halaman Akun Biro', (await page.locator('#bu-name').count()) > 0);
    check(
      'halaman menyebut biro pemilik akun',
      (await page.locator('text=Biro Medan').count()) > 0,
      'Biro Medan'
    );

    // Pilihan role dibatasi ke Reporter Daerah & Magang
    const roles = await page.locator('#bu-role option').allInnerTexts();
    check(
      'pilihan role = Reporter Daerah, Magang, dan Kontributor',
      roles.length === 3 &&
        roles.some((r) => r.includes('Reporter Daerah')) &&
        roles.some((r) => r.includes('Magang')) &&
        roles.some((r) => r.includes('Kontributor')),
      roles.join(', ')
    );
    check(
      'role terlarang (Produser/Admin/Redaktur/Super Admin) tidak tersedia',
      !roles.some((r) => /Produser Pusat|Produser Daerah|Admin|Redaktur|Super Admin/.test(r)),
      roles.join(', ')
    );

    // Tidak ada pilihan biro: biro terkunci ke biro sendiri
    check('tidak ada dropdown biro untuk Produser Daerah (terkunci ke biro sendiri)', (await page.locator('#bu-bureau').count()) === 0);

    // Daftar anggota hanya biro Medan
    const listed = await page.locator('.dtable tbody').innerText();
    check('daftar akun hanya berisi anggota biro Medan', /Medan/.test(listed), listed.replace(/\s+/g, ' ').slice(0, 80));
    check('daftar akun tidak memuat anggota biro lain', !/Surabaya|Makassar|Bandung/.test(listed));

    // Buat akun Reporter Daerah
    await page.fill('#bu-name', 'Reporter Uji Otomatis');
    await page.fill('#bu-email', newReporter);
    await page.selectOption('#bu-role', 'REPORTER_DAERAH');
    await page.fill('#bu-job', 'Reporter Biro Medan');
    await page.fill('#bu-phone', '0811-9999-001');
    await page.fill('#bu-pass', initialPassword);
    const strength = await page.locator('[data-password-strength]').getAttribute('data-password-strength');
    check('indikator kekuatan sandi aktif di form', Number(strength) >= 3, `${strength}/4`);
    await page.click('button:has-text("Buat Akun")');
    await page.waitForSelector('[data-member-created]', { timeout: 60000 });
    check('akun Reporter Daerah berhasil dibuat', (await page.locator('[data-member-created]').count()) > 0);

    // Akun baru muncul di daftar
    await page.reload({ waitUntil: 'domcontentloaded' });
    check('akun baru muncul di daftar akun biro', (await page.locator(`text=${newReporter}`).count()) > 0);
    check(
      'akun baru ditandai wajib ganti sandi',
      (await page.locator('text=wajib ganti sandi').count()) >= 1
    );

    // Buat akun Magang melalui akun yang sama
    await page.fill('#bu-name', 'Magang Uji Otomatis');
    await page.fill('#bu-email', newIntern);
    await page.selectOption('#bu-role', 'MAGANG');
    await page.fill('#bu-pass', initialPassword);
    await page.click('button:has-text("Buat Akun")');
    await page.waitForSelector('[data-member-created]', { timeout: 60000 });
    check('akun Magang berhasil dibuat', (await page.locator('[data-member-created]').count()) > 0);

    // Buat akun Kontributor (role yang baru ditambahkan)
    await page.fill('#bu-name', 'Kontributor Uji Otomatis');
    await page.fill('#bu-email', newContributor);
    await page.selectOption('#bu-role', 'KONTRIBUTOR');
    await page.fill('#bu-job', 'Kontributor Biro Medan');
    await page.fill('#bu-pass', initialPassword);
    await page.click('button:has-text("Buat Akun")');
    await page.waitForSelector('[data-member-created]', { timeout: 60000 });
    check('akun Kontributor berhasil dibuat Produser Daerah', (await page.locator('[data-member-created]').count()) > 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    check('akun Kontributor muncul di daftar akun biro', (await page.locator(`text=${newContributor}`).count()) > 0);
    check(
      'Kontributor biro LAIN tidak ikut tampil (kontributor.bandung tidak ada)',
      !(await page.locator('.dtable tbody').innerText()).includes('kontributor.bandung')
    );

    // Email duplikat ditolak
    await page.fill('#bu-name', 'Duplikat Uji');
    await page.fill('#bu-email', newReporter);
    await page.fill('#bu-pass', initialPassword);
    await page.click('button:has-text("Buat Akun")');
    await page.waitForTimeout(2500);
    check('email duplikat ditolak', (await page.locator('text=sudah terdaftar').count()) > 0);
  });

  // ============ 2. Akun baru dapat dipakai masuk & diminta ganti sandi ============
  await withPage(newReporter, initialPassword, async (page) => {
    check('akun baru dapat masuk memakai sandi awal', page.url().includes('/dashboard'));
    await page.goto(`${BASE}/dashboard/akun`, { waitUntil: 'domcontentloaded' });
    check(
      'sistem meminta pemilik akun mengganti sandi',
      (await page.locator('text=Admin mewajibkan Anda mengganti sandi').count()) > 0
    );
    await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded' });
    check('akun baru dapat membuka form kirim berita', (await page.locator('#title').count()) > 0);
  });

  // ============ 2b. Akun Kontributor baru juga dapat masuk ============
  await withPage(newContributor, initialPassword, async (page) => {
    check('akun Kontributor baru dapat masuk', page.url().includes('/dashboard'));
    await page.goto(`${BASE}/dashboard/kirim`, { waitUntil: 'domcontentloaded' });
    check('akun Kontributor dapat membuka form kirim berita', (await page.locator('#title').count()) > 0);
  });

  // ============ 3. Batasan server: lintas biro & role terlarang DITOLAK ============
  await withPage('produser.medan@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna-biro`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bu-role', { timeout: 30000 });

    // (a) Paksa role terlarang lewat FORM ASLI: opsi ilegal disisipkan ke <select>
    //     lalu form dikirim seperti biasa. Ini menguji penegakan di SERVER (UI saja tidak cukup).
    const forbiddenEmail = `terlarang.${Date.now()}@newsroom.demo`;
    await page.evaluate(() => {
      const sel = document.querySelector('#bu-role');
      const opt = document.createElement('option');
      opt.value = 'PRODUSER_PUSAT';
      opt.textContent = 'Produser Pusat (disisipkan oleh uji)';
      sel.appendChild(opt);
    });
    await page.fill('#bu-name', 'Uji Role Terlarang');
    await page.fill('#bu-email', forbiddenEmail);
    await page.fill('#bu-pass', initialPassword);
    await page.selectOption('#bu-role', 'PRODUSER_PUSAT');
    await page.click('button:has-text("Buat Akun")');
    await page.waitForTimeout(3500);
    const rejectedText = await page.locator('body').innerText();
    check(
      'server MENOLAK role terlarang walau dipaksa dari form (pesan jelas)',
      /hanya dapat membuat akun Reporter Daerah, Magang, dan Kontributor/i.test(rejectedText),
      rejectedText.match(/Produser Daerah hanya[^\n]{0,70}/)?.[0] ?? 'pesan penolakan tidak ditemukan'
    );

    // Pastikan akun terlarang TIDAK terbuat (buka ulang halaman)
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna-biro`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.dtable tbody', { timeout: 30000 });
    const listText = await page.locator('.dtable tbody').innerText();
    check('tidak ada akun role terlarang yang terbuat', !/Uji Role Terlarang/.test(listText), forbiddenEmail);

    // (b) Ubah akun yang BARU dibuat (bukan baris pertama — urutan daftar berdasarkan role)
    const targetRow = page.locator('.dtable tbody tr', { hasText: newReporter }).first();
    check('akun baru dapat ditemukan pada daftar', (await targetRow.count()) > 0);
    await targetRow.locator('button[data-edit-member]').click();
    await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
    const editRoles = await page.locator('[role="dialog"] select[name="role"] option').allInnerTexts();
    check(
      'form ubah juga hanya menawarkan 3 role yang diizinkan',
      editRoles.length === 3 && !editRoles.some((r) => /Produser Pusat|Produser Daerah|Admin|Redaktur/.test(r)),
      editRoles.join(', ')
    );

    // (c) Reset sandi anggota biro (akun baru di atas)
    await page.fill('[role="dialog"] input[name="newPassword"]', 'ResetUji2026!');
    await page.click('[role="dialog"] button:has-text("Simpan Perubahan")');
    await page.waitForSelector('text=ResetUji2026!', { state: 'detached', timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2500);
    check('reset sandi anggota berhasil disimpan', (await page.locator('[role="dialog"]').count()) === 0);

    // (d) Pastikan Produser Daerah TIDAK bisa mengelola lintas biro lewat halaman admin
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna`, { waitUntil: 'domcontentloaded' });
    check(
      'Produser Daerah tidak dapat membuka manajemen pengguna global (dialihkan)',
      !page.url().includes('/pengaturan/pengguna'),
      page.url().split('/newsroom-hub')[1] ?? page.url()
    );
  });

  // ============ 4. Sandi hasil reset admin biro dapat dipakai ============
  await withPage(newReporter, 'ResetUji2026!', async (page) => {
    check('sandi hasil reset Produser Daerah dapat dipakai masuk', page.url().includes('/dashboard'));
  });

  // ============ 5. Admin/Super Admin tetap dapat mengelola semua biro ============
  await withPage('admin@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna-biro`, { waitUntil: 'domcontentloaded' });
    check('Admin dapat membuka halaman Akun Biro', (await page.locator('#bu-name').count()) > 0);
    check('Admin melihat dropdown biro (boleh lintas biro)', (await page.locator('#bu-bureau').count()) > 0);
    const adminRoles = await page.locator('#bu-role option').allInnerTexts();
    check(
      'Admin dapat membuat role daerah yang lebih luas',
      adminRoles.some((r) => /Produ?ser Daerah/.test(r)) && adminRoles.some((r) => /Kontributor/.test(r)),
      adminRoles.join(', ')
    );
    const listed = await page.locator('.dtable tbody').innerText();
    check('Admin melihat akun dari beberapa biro', /Medan/.test(listed) && /Surabaya/.test(listed), 'multi-biro');
    check('menu "Akun Biro Saya" tersedia di navigasi pengaturan', (await page.locator('a:has-text("Akun Biro")').count()) > 0);

    // ---------- AUDIT Okt 2026 (A-2): akun SUPER_ADMIN tidak boleh disentuh Admin ----------
    // Dulu seorang ADMIN dapat menurunkan role + menetapkan sandi baru akun SUPER_ADMIN
    // dari halaman ini (ambil alih akun puncak).
    const adminRow = page.locator('.dtable tbody tr', { hasText: 'superadmin@newsroom.demo' });
    check('akun Super Admin TIDAK muncul di daftar Akun Biro bagi Admin', (await adminRow.count()) === 0);
    check('akun sendiri juga tidak muncul di daftar', (await page.locator('.dtable tbody tr', { hasText: 'admin@newsroom.demo' }).count()) === 0);

    // Penegakan di SERVER: pakai form ubah yang ASLI (wiring client-side sungguhan), lalu
    // alihkan id sasaran ke akun Super Admin lewat DOM — server HARUS menolak.
    // URUTAN PENTING: isi kolom sandi lebih dulu (memicu re-render React), BARU ubah nilai
    // hidden input `id`; kalau dibalik, React mengembalikan nilai id semula sebelum submit.
    const targetId = await page.evaluate(async () => {
      // Admin melihat semua pengguna di halaman Pengguna; ambil id Super Admin dari barisnya.
      const res = await fetch('/newsroom-hub/dashboard/pengaturan/pengguna', { headers: { accept: 'text/html' } });
      const html = await res.text();
      const row = html.split('<tr').find((r) => r.includes('superadmin@newsroom.demo')) || '';
      const m = /\/dashboard\/pengaturan\/pengguna\/([0-9a-f-]{36})/.exec(row);
      return m ? m[1] : '';
    });
    check('id akun Super Admin terbaca untuk uji paksa', Boolean(targetId), targetId || 'tidak ditemukan');

    const memberRow = page.locator('.dtable tbody tr', { hasText: 'reporter.medan@newsroom.demo' }).first();
    if (targetId && (await memberRow.count()) > 0) {
      await memberRow.locator('button[data-edit-member]').click();
      await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
      await page.fill('[role="dialog"] input[name="newPassword"]', 'AmbilAlih2026!');
      await page.evaluate((id) => {
        const hidden = document.querySelector('[role="dialog"] input[name="id"]');
        if (hidden) hidden.value = id;
      }, targetId);
      const swapped = await page.locator('[role="dialog"] input[name="id"]').inputValue();
      check('sasaran form berhasil dialihkan ke akun Super Admin (uji paksa sah)', swapped === targetId);
      await page.click('[role="dialog"] button:has-text("Simpan Perubahan")');
      await page.waitForTimeout(5000);
      const afterText = await page.locator('body').innerText();
      check(
        'server MENOLAK Admin yang mencoba mengubah akun Super Admin (pesan jelas)',
        /Hanya Super Admin yang dapat mengubah akun admin/i.test(afterText),
        (afterText.match(/Hanya Super Admin[^\n]{0,55}/) || ['(pesan tidak ditemukan)'])[0]
      );
      check(
        'permintaan ditolak → dialog TIDAK ditutup sebagai sukses',
        (await page.locator('[role="dialog"]').count()) === 1
      );
      await page.keyboard.press('Escape');
    } else {
      check('server MENOLAK Admin yang mencoba mengubah akun Super Admin (pesan jelas)', false, 'id/target tidak terbaca');
    }

    // Bukti tambahan: role akun Super Admin tetap tidak berubah di daftar Pengguna.
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna`, { waitUntil: 'domcontentloaded' });
    const superRow = page.locator('.dtable tbody tr', { hasText: 'superadmin@newsroom.demo' }).first();
    const superRowText = (await superRow.innerText().catch(() => '')) || '';
    check(
      'akun Super Admin tetap ber-role Super Admin (tidak berubah)',
      /Super Admin/i.test(superRowText) && !/Reporter Daerah/i.test(superRowText),
      superRowText.replace(/\s+/g, ' ').slice(0, 70)
    );
    check('nama akun Super Admin tidak diubah oleh percobaan tersebut', !/Diambil Alih Uji A2/.test(superRowText));

    // ---------- AUDIT LANJUTAN (A-2): halaman Akun Biro hanya untuk akun BIRO ----------
    // Dulu Admin dapat memakai form ini untuk akun role editorial/pusat (tanpa biro),
    // padahal halaman ini untuk akun biro. Sekarang ditolak dengan pesan jelas.
    const redakturId = await findUserId(page, 'redaktur@newsroom.demo');
    check('id akun Redaktur (tanpa biro) terbaca untuk uji paksa', Boolean(redakturId), redakturId || 'tidak ditemukan');
    // Kembali ke halaman AKUN BIRO (blok sebelumnya meninggalkan halaman Pengguna).
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna-biro`, { waitUntil: 'domcontentloaded' });
    const bureauRow = page.locator('.dtable tbody tr', { hasText: 'reporter.medan@newsroom.demo' }).first();
    if (redakturId && (await bureauRow.count()) > 0) {
      await bureauRow.locator('button[data-edit-member]').click();
      await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
      await page.fill('[role="dialog"] input[name="newPassword"]', 'PaksaRedaktur2026!');
      await page.evaluate((id) => {
        const hidden = document.querySelector('[role="dialog"] input[name="id"]');
        if (hidden) hidden.value = id;
      }, redakturId);
      await page.click('[role="dialog"] button:has-text("Simpan Perubahan")');
      await page.waitForTimeout(5000);
      const afterText = await page.locator('body').innerText();
      check(
        'server MENOLAK Admin memakai form Akun Biro untuk akun role pusat (tanpa biro)',
        /hanya untuk akun biro daerah/i.test(afterText),
        (afterText.match(/Halaman ini hanya untuk akun biro[^\n]{0,45}/i) || ['(pesan tidak ditemukan)'])[0]
      );
      check('permintaan ditolak → dialog tidak ditutup sebagai sukses', (await page.locator('[role="dialog"]').count()) === 1);
      await page.keyboard.press('Escape');
    } else {
      check('server MENOLAK Admin memakai form Akun Biro untuk akun role pusat (tanpa biro)', false, 'id/baris tidak terbaca');
    }
  });

  // Bukti: sandi akun Redaktur TIDAK berubah (masih dapat masuk dengan sandi lamanya).
  await withPage('redaktur@newsroom.demo', 'Demo123!', async () =>
    check('sandi akun Redaktur tidak berubah oleh percobaan tersebut', true)
  );

  // ============ 5b. Akun SENDIRI tidak dikelola dari halaman Pengguna ============
  // Akun sendiri hanya boleh diubah lewat menu Akun & Profil; peran & status sendiri tidak
  // dapat diubah dari halaman pengelolaan (cegah menurunkan wewenang sendiri / terkunci).
  await withPage('superadmin@newsroom.demo', 'Demo123!', async (page) => {
    const saId = await findUserId(page, 'superadmin@newsroom.demo');
    const redakturId = await findUserId(page, 'redaktur@newsroom.demo');
    check('id akun Super Admin & Redaktur terbaca untuk uji akun sendiri', Boolean(saId && redakturId), `${saId ? 'sa' : '-'}/${redakturId ? 'redaktur' : '-'}`);
    if (!saId || !redakturId) return;

    // (a) Tampilan: akun sendiri diberi arahan, bukan form yang selalu gagal.
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna/${saId}`, { waitUntil: 'domcontentloaded' });
    const note = await page.locator('body').innerText();
    check('halaman akun sendiri menampilkan arahan ke menu Akun & Profil', /Akun & Profil/i.test(note) && /akun Anda sendiri/i.test(note));
    check(
      'tombol Simpan / Nonaktifkan / Hapus disembunyikan untuk akun sendiri',
      (await page.locator('button:has-text("Simpan Perubahan")').count()) === 0 &&
        (await page.locator('button:has-text("Nonaktifkan Akun")').count()) === 0 &&
        (await page.locator('button:has-text("Hapus Akun")').count()) === 0
    );

    // (b) Penegakan di SERVER: pakai halaman akun LAIN (tombol simpan ada), lalu alihkan
    // hidden id ke akun Super Admin sendiri → server HARUS menolak.
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna/${redakturId}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((id) => {
      const hidden = document.querySelector('input[name="id"]');
      if (hidden) hidden.value = id;
    }, saId);
    await page.click('button:has-text("Simpan Perubahan")');
    await page.waitForTimeout(5000);
    const afterText = await page.locator('body').innerText();
    check(
      'server MENOLAK perubahan pada akun sendiri dari halaman kelola',
      /akun Anda sendiri/i.test(afterText),
      (afterText.match(/[^\n]*akun Anda sendiri[^\n]*/i) || ['(pesan tidak ditemukan)'])[0].slice(0, 70)
    );

    // (c) Bukti peran Super Admin tidak berubah.
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('.dtable tbody tr', { hasText: 'superadmin@newsroom.demo' }).first();
    const rowText = (await row.innerText().catch(() => '')) || '';
    check('peran Super Admin tetap utuh setelah percobaan akun sendiri', /Super Admin/i.test(rowText), rowText.replace(/\s+/g, ' ').slice(0, 55));
  });

  // ============ 6. Role lain tidak boleh mengakses ============
  await withPage('reporter.medan@newsroom.demo', 'Demo123!', async (page) => {
    await page.goto(`${BASE}/dashboard/pengaturan/pengguna-biro`, { waitUntil: 'domcontentloaded' });
    check(
      'Reporter Daerah tidak dapat membuat akun',
      (await page.locator('text=Akses ditolak').count()) > 0 && (await page.locator('#bu-name').count()) === 0
    );
  });
} catch (e) {
  check(`exception: ${e.message}`, false);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan akun biro lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
