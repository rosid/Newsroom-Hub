'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { loginSchema, zodToState, type ActionState } from '@/lib/validations';
import { logAudit } from '@/lib/audit';
import { getSecuritySettings, isTurnstileReady } from '@/lib/settings';
import { verifyTurnstileResponse } from '@/lib/turnstile';
import { checkThrottle, resetThrottle, throttleMessage } from '@/lib/login-throttle';

/**
 * Login throttling kini DIATUR DARI PANEL (Pengaturan → Keamanan): jumlah percobaan, jendela
 * waktu, dan lama blokir. Implementasinya di `lib/login-throttle.ts` (in-memory per proses,
 * hilang saat restart — cukup untuk brute force dasar tanpa Redis).
 */

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get('email') || '').trim().toLowerCase(),
    password: String(formData.get('password') || ''),
  });
  if (!parsed.success) return zodToState(parsed.error);

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  const ua = (h.get('user-agent') ?? '').slice(0, 200);
  const rateKey = `${parsed.data.email}|${ip}`;
  const security = await getSecuritySettings();

  // ---- 1. Login throttling (batas dari pengaturan) ----
  const rate = checkThrottle(rateKey, {
    maxAttempts: security.throttleMaxAttempts,
    windowMinutes: security.throttleWindowMinutes,
    blockMinutes: security.throttleBlockMinutes,
  });
  if (rate.blocked) {
    await logAudit({
      actor: null,
      action: 'LOGIN_DIBLOKIR',
      entity: 'User',
      entityId: parsed.data.email,
      meta: { ip, retryAfterMinutes: rate.retryAfterMinutes, ua },
    });
    return { ok: false, error: throttleMessage(rate.retryAfterMinutes) };
  }

  // ---- 2. Turnstile Cloudflare (bila dinyalakan & kuncinya lengkap) ----
  // Diperiksa SEBELUM kredensial supaya token tidak bisa dipakai ulang untuk menebak sandi.
  if (isTurnstileReady(security)) {
    const token = String(formData.get('cf-turnstile-response') || '');
    const check = await verifyTurnstileResponse({
      secret: security.turnstileSecret,
      token,
      remoteIp: ip,
    });
    if (!check.ok) {
      await logAudit({
        actor: null,
        action: 'LOGIN_TURNSTILE_GAGAL',
        entity: 'User',
        entityId: parsed.data.email,
        meta: { ip, error: check.error ?? '', codes: check.codes ?? [], ua },
      });
      return { ok: false, error: check.error ?? 'Verifikasi keamanan gagal.' };
    }
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;

  if (!user || !valid) {
    await logAudit({
      actor: null,
      action: 'LOGIN_GAGAL',
      entity: 'User',
      entityId: parsed.data.email,
      meta: { ip, ua, sisa: rate.remaining },
    });
    return {
      ok: false,
      error: `Email atau sandi salah.${rate.remaining <= 2 ? ` (sisa ${rate.remaining} percobaan)` : ''}`,
    };
  }
  if (!user.isActive) {
    return { ok: false, error: 'Akun Anda dinonaktifkan. Hubungi admin redaksi.' };
  }

  resetThrottle(rateKey);
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role;
  // Penanda waktu login untuk AUTO LOGOUT ABSOLUT (lihat session.ts). Wajib diisi di sini:
  // tanpa ini, batas umur sesi tidak dapat dihitung dari waktu login.
  session.startedAt = Date.now();
  await session.save();

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAudit({
    actor: { id: user.id, name: user.name, role: user.role },
    action: 'LOGIN',
    entity: 'User',
    entityId: user.id,
    meta: { ip, ua, sessionHours: security.sessionHours },
  });

  // Catatan: TIDAK memakai redirect() di dalam server action — Next melakukan
  // internal fetch ke origin (default port 3000) yang gagal di VPS dan hanya
  // menambah noise log. Navigasi dilakukan di client (router.push) setelah ok.
  return { ok: true, message: 'Berhasil masuk.' };
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  const uid = session.userId;
  session.destroy();
  if (uid) {
    const u = await prisma.user.findUnique({ where: { id: uid }, select: { name: true, role: true } });
    await logAudit({ actor: u ? { id: uid, name: u.name, role: u.role } : null, action: 'LOGOUT', entity: 'User', entityId: uid });
  }
  redirect('/login');
}
