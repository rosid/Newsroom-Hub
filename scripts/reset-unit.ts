/**
 * Uji unit untuk fitur lupa kata sandi:
 * - token reset: format, hashing (token asli tidak tersimpan), sekali pakai, kedaluwarsa,
 *   pembatalan token lama saat minta tautan baru;
 * - pengaturan email: kelengkapan konfigurasi per provider + ringkasan status;
 * - terjemahan galat pengiriman email (pesan harus benar-benar menolong operator);
 * - template email memuat tautan & informasi penting.
 *
 *   DATABASE_URL="file:/tmp/…/newsroom.db" npx tsx scripts/reset-unit.ts
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import {
  RESET_TOKEN_TTL_MINUTES,
  createResetToken,
  findResetToken,
  consumeResetToken,
  normalizeToken,
  checkResetRate,
  resetRateReset,
} from '../src/lib/password-reset';
import { describeEmail } from '../src/lib/settings';
import { describeError, resetPasswordEmailHtml, extractEmail } from '../src/lib/mail';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function main() {
  // ---------- Siapkan tabel (uji boleh memakai DB salinan /tmp) ----------
  const url = process.env.DATABASE_URL || '';
  check('uji dijalankan pada DB salinan /tmp', url.startsWith('file:/tmp/'), url || '(default)');
  const prisma = new PrismaClient();
  const ddl = readFileSync(path.join(process.cwd(), 'prisma', 'auth-ddl.sql'), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  for (const st of ddl.split(';').map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(st);
  }
  const user = await prisma.user.findFirst({ where: { email: 'reporter.medan@newsroom.demo' } });
  if (!user) {
    check('akun uji tersedia', false, 'jalankan npm run db:seed dulu');
    return;
  }

  // ---------- Token: format & penyimpanan ----------
  await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
  const created = await createResetToken(user.id, '127.0.0.1');
  check('token berbentuk hex 64 karakter', /^[0-9a-f]{64}$/.test(created.token), `${created.token.length} karakter`);
  check('masa berlaku ± 60 menit', Math.abs(created.expiresAt.getTime() - Date.now() - RESET_TOKEN_TTL_MINUTES * 60_000) < 5000, `${RESET_TOKEN_TTL_MINUTES} menit`);

  const rows = await prisma.passwordReset.findMany({ where: { userId: user.id } });
  check('hanya satu baris token aktif', rows.length === 1, `${rows.length} baris`);
  check('token ASLI tidak tersimpan di database', rows[0].tokenHash !== created.token && !rows[0].tokenHash.includes(created.token), rows[0].tokenHash.slice(0, 16) + '…');
  check('yang tersimpan adalah hash SHA-256', rows[0].tokenHash === sha256(created.token), 'cocok');
  check('IP peminta dicatat', rows[0].requestIp === '127.0.0.1');

  // ---------- Token: verifikasi ----------
  const found = await findResetToken(created.token);
  check('token valid dapat diverifikasi', found.ok && found.userId === user.id);
  check('token dengan spasi/newline tetap valid (URL sering terbawa)', (await findResetToken(`  ${created.token}\n`)).ok);
  check('normalisasi token bekerja', normalizeToken(` ${created.token} `) === created.token);
  check('token palsu ditolak', (await findResetToken('a'.repeat(64))).ok === false);
  check('token terlalu pendek ditolak', (await findResetToken('abc')).ok === false);
  check('token kosong ditolak', (await findResetToken('')).ok === false);

  // ---------- Token: sekali pakai ----------
  await consumeResetToken(found.ok ? found.id : '');
  const afterUse = await findResetToken(created.token);
  check('token yang sudah dipakai ditolak', afterUse.ok === false && afterUse.reason === 'used', afterUse.ok ? '' : afterUse.reason);

  // ---------- Token: kedaluwarsa ----------
  const expired = await createResetToken(user.id, '127.0.0.1');
  await prisma.passwordReset.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const exp = await findResetToken(expired.token);
  check('token kedaluwarsa ditolak', exp.ok === false && exp.reason === 'expired', exp.ok ? '' : exp.reason);

  // ---------- Token: minta tautan baru membatalkan tautan lama ----------
  await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
  const first = await createResetToken(user.id, '127.0.0.1');
  const second = await createResetToken(user.id, '127.0.0.1');
  const firstState = await findResetToken(first.token);
  const secondState = await findResetToken(second.token);
  check('tautan lama otomatis batal saat minta tautan baru', firstState.ok === false && secondState.ok === true, firstState.ok ? 'lama masih aktif' : `alasan: ${firstState.reason}`);
  const activeRows = await prisma.passwordReset.count({ where: { userId: user.id, usedAt: null } });
  check('hanya satu tautan aktif per pengguna', activeRows === 1, `${activeRows} aktif`);

  // ---------- Rate limit ----------
  const key = `reset|uji-${Date.now()}|127.0.0.1`;
  resetRateReset(key);
  const results = [1, 2, 3, 4].map(() => checkResetRate(key));
  check('permintaan ke-1..3 diizinkan', results.slice(0, 3).every((r) => !r.blocked));
  check('permintaan ke-4 diblokir (3× per jam)', results[3].blocked === true);
  resetRateReset(key);

  // ---------- Pengaturan email ----------
  const base = { provider: 'smtp' as const, host: '', port: 587, user: '', pass: '', from: '', secure: false, apiKey: '', apiBaseUrl: '', replyTo: '' };
  check('SMTP belum lengkap (host/user/pass kosong) terdeteksi', describeEmail({ ...base }, false).configured === false);
  const smtpReady = describeEmail({ ...base, host: 'mail.garuda.tv', user: 'no-reply@garuda.tv', pass: 'x' }, true);
  check('SMTP lengkap dinyatakan siap', smtpReady.configured === true);
  check('catatan status SMTP mengingatkan blokir port 465/587', /diblokir/.test(smtpReady.note), smtpReady.note.slice(0, 70));
  const apiReady = describeEmail({ ...base, provider: 'brevo', apiKey: 'k' }, true);
  check('HTTP API dinyatakan siap dengan API key', apiReady.configured === true && /443/.test(apiReady.note), apiReady.note.slice(0, 60));
  const apiEmpty = describeEmail({ ...base, provider: 'resend', apiKey: '' }, false);
  check('HTTP API tanpa API key dinyatakan belum lengkap', apiEmpty.configured === false && /API key/.test(apiEmpty.note), apiEmpty.note.slice(0, 60));

  // ---------- Terjemahan galat ----------
  check('galat EAUTH → pesan autentikasi', /[Aa]utentikasi/.test(describeError(Object.assign(new Error('invalid login'), { code: 'EAUTH' }))));
  check('galat ETIMEDOUT → menyarankan HTTP API', /HTTP API|[Tt]imeout/.test(describeError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))), describeError(Object.assign(new Error('t'), { code: 'ETIMEDOUT' })).slice(0, 60));
  check('galat HTTP_401 → menyebut status', /HTTP 401/.test(describeError(Object.assign(new Error('Key not found'), { code: 'HTTP_401' }))), describeError(Object.assign(new Error('Key not found'), { code: 'HTTP_401' })).slice(0, 60));
  check('galat ENOTFOUND → menyebut host', /[Hh]ost/.test(describeError(Object.assign(new Error('dns'), { code: 'ENOTFOUND' }))));
  check('galat TLS → menyarankan port 465/587', /465|587/.test(describeError(new Error('wrong version number (SSL)'))));

  // ---------- Ekstraksi & template email ----------
  check('ekstraksi email dari "Nama <alamat>"', extractEmail('GarudaTV <no-reply@garuda.tv>') === 'no-reply@garuda.tv');
  check('email tidak valid ditolak', extractEmail('bukan-email') === null && extractEmail('') === null);

  const html = resetPasswordEmailHtml({
    branding: { siteName: 'GarudaTV Newsroom Hub', tagline: 'Pusat Kendali Pemberitaan', companyName: 'PT Garuda' },
    url: 'https://rosid.vibecoder.co.id/newsroom-hub/reset-password?token=abc123',
    name: 'Fajar Simbolon',
    minutes: RESET_TOKEN_TTL_MINUTES,
  });
  check('template reset memuat tautan', html.includes('/reset-password?token=abc123'));
  check('template reset memuat nama pengguna', html.includes('Fajar Simbolon'));
  check('template reset menyebut masa berlaku', html.includes('60 menit'));
  check('template reset menyebut sekali pakai', /satu kali/i.test(html));
  check('template reset memuat catatan bila bukan pengguna', /tidak meminta/i.test(html));
  check('template reset memuat nama situs', html.includes('GarudaTV Newsroom Hub'));

  await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
  await prisma.$disconnect();

  console.log(`\n${pass}/${pass + fail} pemeriksaan unit reset lulus`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error('gagal menjalankan uji unit:', e.message);
  process.exit(1);
});
