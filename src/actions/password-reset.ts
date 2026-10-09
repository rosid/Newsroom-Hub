'use server';

import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notify';
import { getEmailSettings, isEmailConfigured } from '@/lib/settings';
import {
  buildAbsoluteUrl,
  getMailBranding,
  passwordChangedEmailHtml,
  resetPasswordEmailHtml,
  sendMail,
} from '@/lib/mail';
import {
  RESET_TOKEN_TTL_MINUTES,
  checkResetRate,
  consumeResetToken,
  createResetToken,
  findResetToken,
  pruneResetTokens,
  resetRateReset,
} from '@/lib/password-reset';
import { forgotPasswordSchema, resetPasswordSchema, zodToState, type ActionState } from '@/lib/validations';

/** State khusus halaman reset: sukses perlu mengarahkan pengguna ke halaman masuk. */
export type ResetState = ActionState & {
  done?: boolean;
  /** Permintaan tercatat, tetapi email reset gagal/belum terkirim (tautan TIDAK ditampilkan). */
  mailFailed?: boolean;
};

async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

/**
 * Permintaan reset kata sandi.
 *
 * KEAMANAN (perbaikan audit Okt 2026 — KRITIS): respons SELALU sama (“bila email
 * terdaftar, tautan dikirim”) agar tidak membocorkan email mana yang terdaftar.
 *
 * PENTING: tautan reset TIDAK PERNAH dikembalikan ke pemanggil. Halaman
 * `/lupa-password` bersifat PUBLIK (tanpa login), jadi menampilkan tautan reset di
 * sana berarti siapa pun yang menebak email terdaftar dapat mengambil alih akun —
 * termasuk akun Super Admin. Sebelumnya, bila email belum diatur/gagal terkirim,
 * action ini mengembalikan URL reset untuk ditampilkan di layar (temuan audit A-1).
 * Pengguna sekarang diarahkan ke admin redaksi; admin dapat menetapkan sandi baru
 * dari halaman Pengaturan → Pengguna (atau Akun Biro Saya), dan tetap menerima
 * notifikasi lonceng ketika permintaan reset gagal dilayani email.
 */
export async function forgotPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') ?? '' });
  if (!parsed.success) return zodToState(parsed.error);
  const email = parsed.data.email;

  const ip = await clientIp();
  const rateKey = `reset|${email}|${ip}`;
  const rate = checkResetRate(rateKey);
  if (rate.blocked) {
    return { ok: false, error: 'Terlalu banyak permintaan reset untuk email ini. Coba lagi sekitar satu jam lagi.' };
  }

  const genericMessage =
    'Bila email tersebut terdaftar, kami sudah mengirim tautan pembuatan kata sandi baru. Silakan periksa kotak masuk (dan folder spam).';

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, isActive: true } });
  if (!user || !user.isActive) {
    await logAudit({ actor: null, action: 'PASSWORD_RESET_REQUEST_UNKNOWN', entity: 'User', entityId: email, meta: { ip } });
    return { ok: true, message: genericMessage };
  }

  await pruneResetTokens();
  const { token } = await createResetToken(user.id, ip);
  const url = await buildAbsoluteUrl(`/reset-password?token=${token}`);
  const emailSettings = await getEmailSettings();
  const configured = isEmailConfigured(emailSettings);

  let mailSent = false;
  let mailError = '';
  if (configured) {
    const branding = await getMailBranding();
    const res = await sendMail({
      to: user.email,
      subject: `Reset kata sandi ${branding.siteName}`,
      html: resetPasswordEmailHtml({ branding, url, name: user.name, minutes: RESET_TOKEN_TTL_MINUTES }),
    });
    mailSent = res.ok;
    mailError = res.error ?? '';
    if (!res.ok) console.warn('[reset] gagal kirim email:', res.error, res.detail ?? '', res.tried?.join(', ') ?? '');
  } else {
    mailError = 'Pengaturan email belum diisi oleh admin.';
  }

  await logAudit({
    actor: null,
    action: mailSent ? 'PASSWORD_RESET_REQUEST' : 'PASSWORD_RESET_REQUEST_MAIL_FAILED',
    entity: 'User',
    entityId: user.id,
    meta: { ip, mailSent, error: mailError.slice(0, 200), emailConfigured: configured },
  });

  // Beri tahu admin bila email tidak bisa dikirim, supaya bisa ditindaklanjuti.
  if (!mailSent) {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
      select: { id: true },
    });
    await notifyUsers(
      admins.map((a) => a.id),
      {
        title: `Permintaan reset kata sandi: ${user.name}`,
        body: `${user.email} meminta reset kata sandi, tetapi email gagal terkirim (${mailError.slice(0, 120)}). Tautan TIDAK ditampilkan di halaman publik — tetapkan sandi baru untuk akun ini lewat Pengaturan → Pengguna, dan lengkapi Pengaturan → Email & Notifikasi agar alur mandiri berjalan lagi.`,
        link: '/dashboard/pengaturan/pengguna',
        type: 'WARNING',
      }
    );
  }

  if (mailSent) {
    return { ok: true, message: genericMessage };
  }

  // Email gagal/belum diatur → JANGAN pernah mengembalikan tautan reset ke pemanggil
  // (halaman ini publik). Pengguna diarahkan ke admin, yang dapat menetapkan sandi baru.
  return {
    ok: true,
    mailFailed: true,
    message: `Permintaan Anda sudah tercatat, tetapi email reset tidak dapat dikirim: ${mailError} Silakan hubungi admin redaksi — admin dapat menetapkan kata sandi baru untuk akun Anda dari halaman Pengaturan → Pengguna.`,
  };
}

/** Simpan kata sandi baru memakai token reset. */
export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token') ?? '',
    newPassword: formData.get('newPassword') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);

  const lookup = await findResetToken(parsed.data.token);
  if (!lookup.ok) {
    await logAudit({
      actor: null,
      action: `PASSWORD_RESET_TOKEN_${lookup.reason.toUpperCase()}`,
      entity: 'PasswordReset',
      entityId: parsed.data.token.slice(0, 12),
    });
    return {
      ok: false,
      error:
        lookup.reason === 'expired'
          ? `Tautan reset sudah kedaluwarsa (berlaku ${RESET_TOKEN_TTL_MINUTES} menit). Silakan minta tautan baru.`
          : lookup.reason === 'used'
            ? 'Tautan reset ini sudah pernah dipakai. Silakan minta tautan baru.'
            : 'Tautan reset tidak dikenali. Pastikan seluruh tautan dari email tersalin dengan benar.',
    };
  }

  const user = await prisma.user.findUnique({ where: { id: lookup.userId } });
  if (!user || !user.isActive) {
    return { ok: false, error: 'Akun tidak ditemukan atau sudah dinonaktifkan. Hubungi admin redaksi.' };
  }

  const sameAsOld = await bcrypt.compare(parsed.data.newPassword, user.passwordHash);
  if (sameAsOld) {
    return { ok: false, error: 'Kata sandi baru tidak boleh sama dengan kata sandi lama.', fieldErrors: { newPassword: 'Sama dengan sandi lama' } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10), mustChangePass: false },
  });
  await consumeResetToken(lookup.id);
  resetRateReset(`reset|${user.email}|${await clientIp()}`);

  await logAudit({ actor: null, action: 'PASSWORD_RESET_SUCCESS', entity: 'User', entityId: user.id, meta: { email: user.email } });

  // Beri tahu pengguna lewat email (bila email siap) + notifikasi lonceng
  const settings = await getEmailSettings();
  if (isEmailConfigured(settings)) {
    const branding = await getMailBranding();
    await sendMail({
      to: user.email,
      subject: `Kata sandi ${branding.siteName} telah diubah`,
      html: passwordChangedEmailHtml({
        branding,
        name: user.name,
        time: new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }),
      }),
    }).catch(() => null);
  }
  await notifyUsers([user.id], {
    title: 'Kata sandi Anda baru saja diubah',
    body: 'Jika bukan Anda yang melakukan, segera hubungi admin redaksi.',
    link: '/dashboard/akun',
    type: 'WARNING',
  });

  // Catatan: TIDAK memakai redirect() di dalam server action (Next melakukan internal
  // fetch ke origin default yang gagal di VPS) — navigasi dilakukan client.
  return { ok: true, done: true, message: 'Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru.' };
}
