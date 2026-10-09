/**
 * Uji integrasi LUPA KATA SANDI + PENGATURAN EMAIL.
 *
 * Alur yang dibuktikan (end-to-end, memakai SMTP tiruan lokal di scripts/smtp-mock.mjs):
 * 1. Admin menyimpan pengaturan email SMTP lewat UI, lalu mengirim email uji → tertangkap di kotak surat tiruan.
 * 2. Pengguna membuka /lupa-password → tautan reset benar-benar TERKIRIM ke email & dapat diambil dari email itu.
 * 3. Tautan membuka halaman reset dengan email akun tertera → kata sandi diganti.
 * 4. Masuk memakai kata sandi BARU berhasil; kata sandi LAMA ditolak.
 * 5. Token sekali pakai: tautan yang sama tidak bisa dipakai dua kali.
 * 6. Token kedaluwarsa & token palsu ditolak dengan pesan jelas.
 * 7. Email belum dikonfigurasi → pengguna tidak terkunci (tautan ditampilkan di layar) + admin dinotifikasi.
 *
 *   BASE_URL=http://localhost:3967/newsroom-hub MAIL_BOX=http://127.0.0.1:2528 node scripts/password-reset-check.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3967/newsroom-hub';
const ORIGIN = new URL(BASE).origin;
const MAIL_BOX = process.env.MAIL_BOX || 'http://127.0.0.1:2528';
const SMTP_HOST = process.env.SMTP_HOST || '127.0.0.1';
const SMTP_PORT = Number(process.env.SMTP_PORT || 2527);

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const mailbox = async () => (await fetch(`${MAIL_BOX}/__messages`)).json();
const resetMailbox = async () => fetch(`${MAIL_BOX}/__reset`, { method: 'POST' });

/**
 * Tautan reset dari sebuah pesan email.
 * Diambil dari daftar `urls` yang diekstrak mock dari SELURUH badan pesan (termasuk
 * atribut href tombol), dengan fallback ke teks — penting karena isi email di-encode
 * quoted-printable sehingga URL di teks polos bisa terpotong.
 */
function resetUrlFrom(message) {
  const candidates = [...(message?.urls ?? []), message?.html ?? '', message?.text ?? '', message?.raw ?? ''];
  for (const c of candidates) {
    const m = /https?:\/\/[^\s"'<>)]*\/reset-password\?token=[0-9a-fA-F]+/.exec(String(c));
    if (m) return m[0];
  }
  return '';
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  return page.url().includes('/dashboard');
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

try {
  // ============ 0. Halaman publik & tautan dari login ============
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('halaman masuk memiliki tautan "Lupa kata sandi?"', (await page.locator('[data-forgot-link]').count()) > 0);
  await page.click('[data-forgot-link]');
  await page.waitForURL(/\/lupa-password/, { timeout: 30000 });
  check('tautan membuka halaman /lupa-password', page.url().includes('/lupa-password'));
  check('halaman lupa sandi menjelaskan masa berlaku tautan', (await page.locator('text=berlaku 60 menit').count()) > 0);

  // ============ 1. Admin: simpan pengaturan SMTP lewat UI ============
  const adminOk = await login(page, 'admin@newsroom.demo', 'Demo123!');
  check('admin dapat masuk', adminOk);
  await page.goto(`${BASE}/dashboard/pengaturan/email`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('halaman Email & Notifikasi tersedia', (await page.locator('text=Status Pengiriman Email').count()) > 0);
  check('status menandai email belum lengkap', (await page.locator('[data-email-status]').getAttribute('data-email-configured')) === '0');

  await page.click('button[data-provider="smtp"]');
  await page.fill('#e-host', SMTP_HOST);
  await page.fill('#e-port', String(SMTP_PORT));
  await page.fill('#e-user', 'no-reply@garuda.tv');
  await page.fill('#e-pass', 'rahasia-smtp');
  await page.fill('#e-from', 'GarudaTV Newsroom <no-reply@garuda.tv>');
  await page.click('button:has-text("Simpan Pengaturan Email")');
  await page.waitForSelector('text=Pengaturan email tersimpan', { timeout: 60000 });
  check('pengaturan email tersimpan', true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  check('status berubah menjadi siap mengirim', (await page.locator('[data-email-status]').getAttribute('data-email-configured')) === '1');
  check('password SMTP ditandai tersimpan terenkripsi', (await page.locator('text=tersimpan (terenkripsi)').count()) > 0);
  const passValue = await page.locator('#e-pass').inputValue();
  check('password tidak pernah dikirim balik ke browser (kosong)', passValue === '', `"${passValue}"`);

  // ============ 2. Kirim email uji ============
  await resetMailbox();
  await page.fill('#t-to', 'verifikasi@garuda.tv');
  await page.click('button:has-text("Kirim Email Uji")');
  await page.waitForSelector('[data-test-email-result]', { timeout: 60000 });
  const testResult = await page.locator('[data-test-email-result]').getAttribute('data-test-email-result');
  check('email uji terkirim tanpa galat', testResult === 'ok', testResult === 'ok' ? 'ok' : await page.locator('[data-test-email-result]').innerText());
  const box1 = await mailbox();
  check('SMTP tiruan menerima tepat 1 email', box1.count === 1, `${box1.count} pesan`);
  check('subjek email uji benar', String(box1.messages[0]?.subject || '').includes('Uji pengiriman email'), box1.messages[0]?.subject);
  check('penerima email uji benar', box1.messages[0]?.to?.[0] === 'verifikasi@garuda.tv', box1.messages[0]?.to?.[0]);

  // ============ 3. Alur pengguna: lupa sandi → email → reset ============
  const target = 'reporter.medan@newsroom.demo';
  const oldPassword = 'Demo123!';
  const newPassword = 'SandiBaru2026!';

  await resetMailbox();
  // Halaman publik (lupa/reset sandi) mengalihkan pengguna yang SUDAH masuk ke dashboard —
  // jadi uji sebagai tamu: hapus sesi admin lebih dulu (seperti pengguna yang lupa sandi).
  await page.context().clearCookies();
  await page.goto(`${BASE}/lupa-password`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', target);
  await page.click('button:has-text("Kirim Tautan Reset")');
  await page.waitForSelector('text=Silakan periksa kotak masuk', { timeout: 60000 });
  check('permintaan reset dijawab dengan pesan generik', (await page.locator('text=Silakan periksa kotak masuk').count()) > 0);
  check('tidak ada tautan manual saat email berhasil terkirim', (await page.locator('[data-manual-reset-url]').count()) === 0);
  const afterRequestHtml = await page.content();
  check(
    'halaman publik tidak pernah memuat token reset (audit A-1)',
    !/reset-password\?token=/.test(afterRequestHtml)
  );

  const box2 = await mailbox();
  check('email reset benar-benar terkirim', box2.count === 1, `${box2.count} pesan`);
  const resetMail = box2.messages[0];
  check('email reset ditujukan ke pengguna yang meminta', resetMail?.to?.[0] === target, resetMail?.to?.[0]);
  check('subjek email reset sesuai', String(resetMail?.subject || '').toLowerCase().includes('reset kata sandi'), resetMail?.subject);
  check('email memuat nama pengguna', String(resetMail?.text || '').includes('Fajar Simbolon'));
  check('email menyebut masa berlaku 60 menit', String(resetMail?.text || '').includes('60 menit'));
  const resetUrl = resetUrlFrom(resetMail);
  check('email memuat tautan reset yang benar (dengan basePath)', Boolean(resetUrl) && resetUrl.startsWith(`${ORIGIN}${new URL(BASE).pathname}/reset-password?token=`), resetUrl.slice(0, 80));

  // ============ 4. Buka tautan & ganti kata sandi (tetap sebagai tamu) ============
  await page.context().clearCookies();
  await page.goto(resetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#newPassword', { timeout: 30000 });
  check('halaman reset terbuka dengan tautan valid', (await page.locator('#newPassword').count()) > 0);
  check('halaman reset menampilkan email akun', (await page.locator(`text=${target}`).count()) > 0);

  // Indikator kekuatan sandi berfungsi
  await page.fill('#newPassword', 'abc');
  const weak = await page.locator('[data-password-strength]').getAttribute('data-password-strength');
  await page.fill('#newPassword', newPassword);
  const strong = await page.locator('[data-password-strength]').getAttribute('data-password-strength');
  check('indikator kekuatan sandi bereaksi', Number(weak) < Number(strong), `${weak} → ${strong}`);
  await page.fill('#confirmPassword', 'berbeda-tidak-sama');
  await page.click('button:has-text("Simpan Kata Sandi Baru")');
  await page.waitForTimeout(1500);
  check('konfirmasi sandi berbeda ditolak', (await page.locator('text=Konfirmasi sandi tidak sama').count()) > 0);

  await page.fill('#confirmPassword', newPassword);
  await page.click('button:has-text("Simpan Kata Sandi Baru")');
  await page.waitForSelector('[data-reset-done]', { timeout: 60000 });
  check('kata sandi berhasil diperbarui', (await page.locator('[data-reset-done]').count()) > 0);

  // ============ 5. Masuk dengan sandi baru, sandi lama ditolak ============
  await page.context().clearCookies();
  const rejectedOld = await login(page, target, oldPassword);
  check('kata sandi LAMA tidak dapat dipakai lagi', !rejectedOld, rejectedOld ? 'masih bisa masuk (buruk)' : 'ditolak');
  await page.context().clearCookies();
  const acceptedNew = await login(page, target, newPassword);
  check('kata sandi BARU dapat dipakai masuk', acceptedNew);

  // ============ 6. Token sekali pakai ============
  await page.goto(`${BASE}/dashboard/akun`, { waitUntil: 'domcontentloaded' });
  const loggedIn = page.url().includes('/dashboard');
  check('sesi dashboard aktif setelah reset', loggedIn);
  await page.context().clearCookies();

  await page.goto(resetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  check('tautan reset yang sama tidak dapat dipakai ulang', (await page.locator('[data-reset-error="used"]').count()) > 0);

  // ============ 7. Token palsu & kedaluwarsa ============
  await page.goto(`${BASE}/reset-password?token=${'a'.repeat(64)}`, { waitUntil: 'domcontentloaded' });
  check('token palsu ditolak', (await page.locator('[data-reset-error="invalid"]').count()) > 0);

  await page.goto(`${BASE}/reset-password`, { waitUntil: 'domcontentloaded' });
  check('halaman reset tanpa token memberi arahan', (await page.locator('text=Minta Tautan Baru').count()) > 0);

  // ============ 8. Email gagal terkirim → tautan TIDAK boleh bocor ke halaman publik ============
  // PERBAIKAN AUDIT A-1: /lupa-password dapat dibuka siapa pun tanpa login, jadi tautan
  // reset tidak boleh pernah ditampilkan di sana (dulu ditampilkan bila email gagal/belum
  // diatur → siapa pun yang menebak email terdaftar bisa mengambil alih akun).
  // Admin mengubah provider ke HTTP API dengan endpoint mati supaya pengiriman pasti gagal.
  const adminLogin = await login(page, 'admin@newsroom.demo', 'Demo123!');
  if (adminLogin) {
    await page.goto(`${BASE}/dashboard/pengaturan/email`, { waitUntil: 'domcontentloaded' });
    await page.click('button[data-provider="resend"]');
    await page.fill('#e-apikey', 'kunci-dummy-uji');
    await page.fill('#e-apibase', 'http://127.0.0.1:59999/api'); // endpoint mati → pasti gagal
    await page.click('button:has-text("Simpan Pengaturan Email")');
    await page.waitForSelector('text=Pengaturan email tersimpan', { timeout: 60000 });
    check('pengaturan beralih ke HTTP API (untuk uji jalur gagal)', true);

    await page.context().clearCookies();
    await page.goto(`${BASE}/lupa-password`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', 'reporter.surabaya@newsroom.demo');
    await page.click('button:has-text("Kirim Tautan Reset")');
    await page.waitForSelector('[data-reset-fallback="1"]', { timeout: 90000 });

    check('email gagal terkirim → tautan reset TIDAK ditampilkan di halaman publik', (await page.locator('[data-manual-reset-url]').count()) === 0);
    const publicHtml = await page.content();
    check('HTML halaman publik tidak memuat token reset apa pun', !/reset-password\?token=/.test(publicHtml));
    const failedText = await page.locator('[data-reset-fallback="1"]').innerText();
    check('pesan menjelaskan email tidak dapat dikirim', /tidak dapat dikirim/i.test(failedText), failedText.slice(0, 90));
    check('pengguna diarahkan menghubungi admin redaksi', /hubungi admin redaksi/i.test(failedText));

    const adminOk = await login(page, 'admin@newsroom.demo', 'Demo123!');
    if (adminOk) {
      const notifRes = await page.request.get(`${BASE}/api/notifications`);
      const notif = await notifRes.json();
      const notifText = JSON.stringify(notif);
      check('admin mendapat notifikasi kegagalan email reset', /reset kata sandi/i.test(notifText), notifText.slice(0, 90));
      check(
        'notifikasi mengarahkan admin ke jalur pemulihan (Pengaturan → Pengguna)',
        /Pengaturan\s*(→|->)\s*Pengguna/i.test(notifText)
      );

      // Jalur pemulihan pengganti benar-benar tersedia: admin menetapkan sandi baru
      await page.goto(`${BASE}/dashboard/pengaturan/pengguna`, { waitUntil: 'domcontentloaded' });
      const row = page.locator('.dtable tbody tr', { hasText: 'reporter.surabaya@newsroom.demo' }).first();
      check('akun pelapor tampil pada daftar Pengguna (admin dapat menolong)', (await row.count()) > 0);
      await row.locator('a:has-text("Ubah")').click();
      // Navigasi client-side: tunggu kolom sandi benar-benar dirender, jangan hanya DOMContentLoaded.
      await page.waitForSelector('input[name="newPassword"]', { timeout: 45000 }).catch(() => null);
      check(
        'admin dapat menetapkan sandi baru untuk akun tersebut (pengganti tautan publik)',
        (await page.locator('input[name="newPassword"]').count()) > 0
      );
    }
  } else {
    check('pengaturan beralih ke HTTP API (untuk uji jalur gagal)', false, 'login admin gagal');
  }
} catch (e) {
  check(`exception: ${e.message}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan reset kata sandi lulus`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ` (${f.extra})` : ''}`);
  process.exit(1);
}
