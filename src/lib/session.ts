import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cache } from 'react';
import { getAppSecret } from './secret';
import { prisma } from './prisma';
import { getSessionMaxAgeSeconds } from './settings';
import type { Role, User, Bureau } from '@prisma/client';

export type SessionData = {
  userId?: string;
  email?: string;
  name?: string;
  role?: Role;
  theme?: 'dark' | 'light';
  /**
   * Waktu login (epoch ms) — dipakai untuk AUTO LOGOUT ABSOLUT.
   *
   * Cookie saja tidak cukup: umur cookie diperpanjang setiap kali sesi disimpan, sehingga
   * pengguna yang aktif tidak akan pernah logout. Nilai ini membuat batasnya dihitung dari
   * WAKTU LOGIN (tidak diperpanjang), sesuai kemampuan "auto logout jika login lebih dari N jam".
   */
  startedAt?: number;
};

// Secret aplikasi (env SESSION_SECRET → berkas .session-secret → acak per proses).
// Dipakai bersama modul kripto untuk mengenkripsi kredensial storage di database.
export const SESSION_SECRET = getAppSecret();

/** Bawaan bila pengaturan belum ada: 12 jam (perilaku lama sebelum ada pengaturan keamanan). */
export const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 12;

/**
 * Opsi sesi. Durasi diambil dari Pengaturan → Keamanan (`sessionHours`, bawaan 72 jam = 3x24 jam).
 *
 * `ttl` (umur segel iron-session) dan `cookieOptions.maxAge` SENGAJA disamakan supaya cookie
 * dan segelnya kedaluwarsa bersamaan — kalau hanya salah satu yang diubah, akan muncul
 * kombinasi membingungkan (cookie masih ada tapi isinya ditolak, atau sebaliknya).
 */
export function sessionOptionsFor(maxAgeSeconds: number): SessionOptions {
  const maxAge = Math.max(60, Math.floor(maxAgeSeconds) || DEFAULT_SESSION_MAX_AGE);
  return {
    password: SESSION_SECRET,
    cookieName: 'newsroom_session',
    ttl: maxAge,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        process.env.COOKIE_SECURE !== undefined
          ? process.env.COOKIE_SECURE === 'true'
          : process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const { getSessionMaxAgeSeconds } = await import('./settings');
  let maxAge = DEFAULT_SESSION_MAX_AGE;
  try {
    maxAge = await getSessionMaxAgeSeconds();
  } catch {
    // Pengaturan tidak terbaca (mis. tabel Setting belum ada) -> pakai bawaan agar login tetap jalan.
  }
  return getIronSession<SessionData>(await cookies(), sessionOptionsFor(maxAge));
}

export type CurrentUser = User & { bureau: Bureau | null };

/** Ambil user aktif dari session cookie (di-cache per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    const session = await getSession();
    if (!session.userId) return null;

    // ---- AUTO LOGOUT ABSOLUT ----
    // Dihitung dari waktu LOGIN (session.startedAt), bukan dari aktivitas terakhir.
    const maxAgeMs = (await getSessionMaxAgeSeconds().catch(() => DEFAULT_SESSION_MAX_AGE)) * 1000;
    const startedAt = Number(session.startedAt ?? 0);
    if (startedAt > 0 && Date.now() - startedAt > maxAgeMs) {
      session.destroy();
      return null;
    }
    // Sesi lama (dibuat sebelum fitur ini ada) belum punya startedAt — isi sekarang supaya
    // batasnya mulai berlaku, tanpa memaksa semua orang login ulang saat pembaruan.
    if (!startedAt) {
      session.startedAt = Date.now();
      await session.save().catch(() => {});
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { bureau: true },
    });
    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    // redirect() Next.js otomatis menambahkan basePath -> JANGAN pakai p() di sini
    redirect('/login');
  }
  return user;
}

export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect('/dashboard?denied=1');
  }
  return user;
}
