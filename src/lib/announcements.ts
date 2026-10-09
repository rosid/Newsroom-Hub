import { prisma } from './prisma';
import { notifyUsers } from './notify';
import { ROLE_LABELS } from './constants';
import type { Announcement, Role } from '@prisma/client';
import type { CurrentUser } from './session';
import { canViewAllPools, isCentralRole } from './permissions';

const alive = (a: Announcement) => a.isActive && (!a.expiresAt || a.expiresAt.getTime() > Date.now());

/** Apakah audiens pengumuman mencakup user ini? */
const matchesAudience = (a: Announcement, user: CurrentUser): boolean => {
  if (canViewAllPools(user)) return true;
  if (a.targetBureauId) return a.targetBureauId === user.bureauId;
  if (a.audience === 'ALL') return true;
  if (a.audience.startsWith('ROLE:')) return a.audience.slice(5) === user.role;
  if (a.audience === 'POOL:PUSAT') return isCentralRole(user.role) || !user.bureauId;
  if (a.audience === 'POOL:DAERAH') return Boolean(user.bureauId);
  return true;
};

/** Pengumuman yang boleh dilihat user sesuai audiens (termasuk yang nonaktif/kedaluwarsa untuk pengelola). */
export async function getAnnouncementsFor(user: CurrentUser): Promise<Announcement[]> {
  const all = await prisma.announcement.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], take: 60 });

  return all.filter((a) => {
    if (!alive(a) && !canViewAllPools(user) && !['REDAKTUR'].includes(user.role)) return false;
    return matchesAudience(a, user);
  });
}

/**
 * Pengumuman yang masih berlaku (aktif & belum kedaluwarsa) dan relevan bagi user —
 * dipakai banner dashboard. Urut prioritas (URGENT lebih dulu), lalu terbaru.
 */
export async function getActiveAnnouncementsFor(user: CurrentUser, take = 3): Promise<Announcement[]> {
  const all = await prisma.announcement.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 60,
  });

  return all.filter((a) => alive(a) && matchesAudience(a, user)).slice(0, take);
}

/** Kirim notifikasi lonceng ke seluruh audiens pengumuman. */
export async function announceToAudience(announcementId: string): Promise<number> {
  const a = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!a || !a.isActive) return 0;

  const where: Record<string, unknown> = { isActive: true };
  if (a.targetBureauId) where.bureauId = a.targetBureauId;
  else if (a.audience.startsWith('ROLE:')) where.role = a.audience.slice(5) as Role;
  else if (a.audience === 'POOL:PUSAT')
    where.OR = [
      { bureauId: null },
      {
        role: {
          in: [
            'SUPER_ADMIN',
            'ADMIN',
            'REDAKTUR',
            'PRODUSER_PUSAT',
            'REPORTER_PUSAT',
            'KOORDINATOR_LIPUTAN',
            'KOORDINATOR_DAERAH',
          ],
        },
      },
    ];
  else if (a.audience === 'POOL:DAERAH') where.bureauId = { not: null };

  const users = await prisma.user.findMany({ where, select: { id: true } });
  await notifyUsers(
    users.map((u) => u.id),
    {
      title: `Pengumuman: ${a.title}`,
      body: a.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140),
      link: '/dashboard/pengumuman',
      type: a.priority === 'URGENT' ? 'DANGER' : a.priority === 'PENTING' ? 'WARNING' : 'INFO',
    }
  );
  return users.length;
}

export const audienceLabel = (a: Pick<Announcement, 'audience' | 'targetBureauId'>, bureauName?: string | null) => {
  if (a.targetBureauId) return `Biro: ${bureauName ?? 'terpilih'}`;
  if (a.audience === 'ALL') return 'Semua pengguna';
  if (a.audience.startsWith('ROLE:')) {
    const r = a.audience.slice(5) as Role;
    return `Role: ${ROLE_LABELS[r] ?? r}`;
  }
  if (a.audience === 'POOL:PUSAT') return 'Pool Pusat';
  if (a.audience === 'POOL:DAERAH') return 'Semua Biro Daerah';
  return a.audience;
};
