'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { loginSchema, zodToState, type ActionState } from '@/lib/validations';
import { logAudit } from '@/lib/audit';

/**
 * Rate limit in-memory: 5 percobaan / 10 menit per email+IP.
 * (Hilang saat server restart — cukup untuk mencegah brute force dasar.)
 */
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function checkRate(key: string): { blocked: boolean; remaining: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return { blocked: false, remaining: MAX_ATTEMPTS - 1 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { blocked: true, remaining: 0 };
  }
  return { blocked: false, remaining: MAX_ATTEMPTS - entry.count };
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get('email') || '').trim().toLowerCase(),
    password: String(formData.get('password') || ''),
  });
  if (!parsed.success) return zodToState(parsed.error);

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  const rateKey = `${parsed.data.email}|${ip}`;
  const rate = checkRate(rateKey);
  if (rate.blocked) {
    return { ok: false, error: 'Terlalu banyak percobaan masuk. Coba lagi dalam 10 menit.' };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;

  if (!user || !valid) {
    await logAudit({
      actor: null,
      action: 'LOGIN_GAGAL',
      entity: 'User',
      entityId: parsed.data.email,
      meta: { ip },
    });
    return {
      ok: false,
      error: `Email atau sandi salah.${rate.remaining <= 2 ? ` (sisa ${rate.remaining} percobaan)` : ''}`,
    };
  }
  if (!user.isActive) {
    return { ok: false, error: 'Akun Anda dinonaktifkan. Hubungi admin redaksi.' };
  }

  attempts.delete(rateKey);
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role;
  await session.save();

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAudit({
    actor: { id: user.id, name: user.name, role: user.role },
    action: 'LOGIN',
    entity: 'User',
    entityId: user.id,
    meta: { ip },
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
