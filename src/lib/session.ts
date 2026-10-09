import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cache } from 'react';
import { getAppSecret } from './secret';
import { prisma } from './prisma';
import type { Role, User, Bureau } from '@prisma/client';

export type SessionData = {
  userId?: string;
  email?: string;
  name?: string;
  role?: Role;
  theme?: 'dark' | 'light';
};

// Secret aplikasi (env SESSION_SECRET → berkas .session-secret → acak per proses).
// Dipakai bersama modul kripto untuk mengenkripsi kredensial storage di database.
export const SESSION_SECRET = getAppSecret();

export const sessionOptions: SessionOptions = {
  password: SESSION_SECRET,
  cookieName: 'newsroom_session',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.COOKIE_SECURE !== undefined
        ? process.env.COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export type CurrentUser = User & { bureau: Bureau | null };

/** Ambil user aktif dari session cookie (di-cache per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    const session = await getSession();
    if (!session.userId) return null;
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
