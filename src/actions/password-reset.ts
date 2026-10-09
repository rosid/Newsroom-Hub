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
export type ResetState = ActionState & { done?: boolean };

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
 * Keamanan: respons SELALU sama (“bila email terdaftar, tautan dikirim”) agar tidak
 * membocorkan email mana yang terdaftar. Bila email belum dikonfigurasi atau gagal
 * terkirim, admin tetap dapat menolong pengguna — tautan disediakan langsung di layar
 * (aplikasi internal, sehingga ini lebih berguna daripada membuat pengguna terkunci).
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
        body: `${user.email} meminta reset kata sandi, tetapi email gagal terkirim (${mailError.slice(0, 120)}). Buka Pengaturan → Email & Notifikasi untuk memperbaikinya.`,
        link: '/dashboard/pengaturan/email',
        type: 'WARNING',
      }
    );
  }

  if (mailSent) {
    return { ok: true, message: genericMessage };
  }

  // Email gagal/belum diatur → tampilkan tautan manual (aplikasi internal) + alasan jelas
  return {
    ok: true,
    message: `Tautan reset dibuat, tetapi email TIDAK terkirim: ${mailError} Gunakan tautan di bawah untuk mengganti kata sandi, dan minta admin melengkapi pengaturan email (Pengaturan → Email & Notifikasi).`,
    fieldErrors: { manualUrl: url },
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
