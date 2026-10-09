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
