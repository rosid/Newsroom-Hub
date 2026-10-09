import { prisma } from './prisma';
import { genId } from './id';
import type { NotifType, Role } from '@prisma/client';

type NotifInput = {
  title: string;
  body?: string;
  link?: string;
  type?: NotifType;
};

/** Kirim notifikasi ke daftar user (lonceng notifikasi di header). */
export async function notifyUsers(userIds: string[], input: NotifInput): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({
        id: genId(),
        userId,
        title: input.title,
        body: input.body ?? '',
        link: input.link ?? '',
        type: input.type ?? 'INFO',
      })),
    });
  } catch (e) {
    console.warn('[notify] gagal mengirim notifikasi:', (e as Error).message);
  }
}

export async function notifyRoles(roles: Role[], input: NotifInput, excludeUserId?: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: roles }, isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  await notifyUsers(users.map((u) => u.id), input);
}

export async function notifyBureauProdusers(bureauId: string, input: NotifInput): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      bureauId,
      isActive: true,
      role: { in: ['PRODUSER_DAERAH', 'REPORTER_DAERAH', 'KONTRIBUTOR'] },
    },
    select: { id: true },
  });
  await notifyUsers(users.map((u) => u.id), input);
}
