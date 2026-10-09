import { NewsStatus, Pool, Role, type Prisma } from '@prisma/client';
import type { CurrentUser } from './session';

export type NewsLike = {
  authorId: string;
  authorBureauId: string | null;
  originPool: Pool;
  isPushedToCenter: boolean;
  status: NewsStatus;
};

const CENTRAL_ROLES: Role[] = [
  'REDAKTUR',
  'PRODUSER_PUSAT',
  'REPORTER_PUSAT',
  // Kedua role koordinator memiliki hak akses setara Produser Pusat
  'KOORDINATOR_LIPUTAN',
  'KOORDINATOR_DAERAH',
];
const REGIONAL_ROLES: Role[] = ['PRODUSER_DAERAH', 'REPORTER_DAERAH', 'KONTRIBUTOR', 'MAGANG'];
/** Status berita pusat yang boleh dilihat oleh pengguna biro daerah. */
const CENTRAL_VISIBLE_TO_REGION: NewsStatus[] = ['VERIFIED', 'PUBLISHED'];

export const isSuperAdmin = (u: { role: Role }) => u.role === 'SUPER_ADMIN';
export const isAdmin = (u: { role: Role }) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN';
/** Pengguna dengan cakupan kerja pool pusat (tidak melihat pool daerah). */
export const isCentralRole = (role: Role) => CENTRAL_ROLES.includes(role);
export const isRegionalRole = (role: Role) => REGIONAL_ROLES.includes(role);
/** Boleh melihat seluruh pool (monitoring). */
export const canViewAllPools = (u: { role: Role }) => isAdmin(u);

/**
 * ATURAN INTI PEMISAHAN POOL:
 * - Admin/Super Admin  : semua pool (monitoring).
 * - Redaktur/Produser/Reporter Pusat : HANYA pool pusat + berita daerah yang
 *   sudah DORONG KE PUSAT. Tidak bisa melihat tabulasi daerah (sesuai permintaan).
 * - Produser/Reporter/Kontributor Daerah : pool biro-nya sendiri + pool pusat
 *   (yang sudah terverifikasi/disiarkan).
 * - Magang : hanya kiriman miliknya sendiri.
 */
export function newsVisibilityWhere(user: CurrentUser): Prisma.NewsWhereInput {
  if (canViewAllPools(user)) return {};

  const centralVisible: Prisma.NewsWhereInput = {
    OR: [{ originPool: Pool.PUSAT }, { isPushedToCenter: true }],
    status: { in: CENTRAL_VISIBLE_TO_REGION },
  };

  if (isCentralRole(user.role)) {
    return { OR: [{ originPool: Pool.PUSAT }, { isPushedToCenter: true }] };
  }

  if (user.role === 'MAGANG') {
    return { authorId: user.id };
  }

  if (!user.bureauId) {
    // Pengguna daerah tanpa biro: hanya boleh melihat pool pusat.
    return centralVisible;
  }

  return {
    OR: [{ authorBureauId: user.bureauId }, centralVisible],
  };
}

export function canViewNews(user: CurrentUser, news: NewsLike): boolean {
  if (canViewAllPools(user)) return true;
  if (news.authorId === user.id) return true;
  if (isCentralRole(user.role)) {
    return news.originPool === Pool.PUSAT || news.isPushedToCenter;
  }
  if (user.role === 'MAGANG') return false;
  if (!user.bureauId) return false;
  if (news.authorBureauId === user.bureauId) return true;
  const isCentralNews = news.originPool === Pool.PUSAT || news.isPushedToCenter;
  return isCentralNews && CENTRAL_VISIBLE_TO_REGION.includes(news.status);
}

/** Siapa saja boleh mengirim berita (naskah + footage). */
export const canSubmitNews = (_u: { role: Role }) => true;

export function canEditNews(user: CurrentUser, news: NewsLike): boolean {
  if (canViewAllPools(user)) return true;
  if (news.status === 'PUBLISHED' && !isAdmin(user)) return false;
  if (news.authorId === user.id) return true;
  if (user.role === 'PRODUSER_DAERAH' && news.authorBureauId === user.bureauId) return true;
  if (
    (user.role === 'PRODUSER_PUSAT' ||
      user.role === 'KOORDINATOR_LIPUTAN' ||
      user.role === 'KOORDINATOR_DAERAH') &&
    news.originPool === Pool.PUSAT
  ) {
    return true;
  }
  return user.role === 'REDAKTUR' && (news.originPool === Pool.PUSAT || news.isPushedToCenter);
}

export function canDeleteNews(user: CurrentUser, news: NewsLike): boolean {
  if (isAdmin(user)) return true;
  if (news.authorId === user.id && news.status !== 'PUBLISHED') return true;
  return false;
}

/** Validasi berita: produser biro untuk berita biro-nya, produser pusat untuk pool pusat. */
export function canReview(user: CurrentUser, news: NewsLike): boolean {
  if (isAdmin(user)) return true;
  if (user.role === 'PRODUSER_DAERAH') return news.authorBureauId === user.bureauId;
  if (user.role === 'PRODUSER_PUSAT' || user.role === 'KOORDINATOR_LIPUTAN' || user.role === 'KOORDINATOR_DAERAH') {
    return news.originPool === Pool.PUSAT;
  }
  if (user.role === 'REDAKTUR') return news.originPool === Pool.PUSAT || news.isPushedToCenter;
  return false;
}

/** Dorong berita daerah ke Pool Tabulasi Pusat (siaran nasional). */
export function canPushToCenter(user: CurrentUser, news: NewsLike): boolean {
  if (news.isPushedToCenter) return false;
  if (isAdmin(user)) return true;
  if (user.role === 'REDAKTUR') return true;
  // Koordinator daerah mengoordinasikan biro — boleh mendorong berita daerah ke pusat
  if (user.role === 'KOORDINATOR_DAERAH') {
    return news.originPool === Pool.DAERAH;
  }
  if (user.role === 'PRODUSER_DAERAH') {
    return news.originPool === Pool.DAERAH && news.authorBureauId === user.bureauId;
  }
  return false;
}

/**
 * Cakupan wewenang penayangan (ONAIR/MEDSOS), TANPA syarat status VERIFIED.
 * Dipakai agar kanal kedua tetap dapat ditandai setelah berita tayang di kanal pertama
 * (mis. sudah ONAIR lalu juga diunggah ke MEDSOS).
 */
export function canAirNews(user: CurrentUser, news: NewsLike): boolean {
  // Syarat status berlaku untuk SEMUA role — termasuk Admin. Tanpa ini, berita yang masih
  // DRAFT/PENDING bisa ditandai tayang dan alur editorial (validasi produser) terlangkahi.
  if (news.status !== 'VERIFIED' && news.status !== 'PUBLISHED') return false;
  if (isAdmin(user)) return true;
  if (
    user.role === 'REDAKTUR' ||
    user.role === 'PRODUSER_PUSAT' ||
    user.role === 'KOORDINATOR_LIPUTAN' ||
    user.role === 'KOORDINATOR_DAERAH'
  ) {
    return news.originPool === Pool.PUSAT || news.isPushedToCenter;
  }
  return user.role === 'PRODUSER_DAERAH' && news.authorBureauId === user.bureauId;
}

/** Menyiarkan berita (publish). */
export function canPublish(user: CurrentUser, news: NewsLike): boolean {
  if (isAdmin(user)) return true;
  if (news.status !== 'VERIFIED') return false;
  if (
    user.role === 'REDAKTUR' ||
    user.role === 'PRODUSER_PUSAT' ||
    user.role === 'KOORDINATOR_LIPUTAN' ||
    user.role === 'KOORDINATOR_DAERAH'
  ) {
    return news.originPool === Pool.PUSAT || news.isPushedToCenter;
  }
  // Produser daerah boleh menyiarkan berita biro-nya sendiri untuk kanal daerah.
  return user.role === 'PRODUSER_DAERAH' && news.authorBureauId === user.bureauId;
}

export const canManageUsers = (u: { role: Role }) => isAdmin(u);
export const canManageBureau = (u: { role: Role }) => isAdmin(u);
export const canManageMaster = (u: { role: Role }) => isAdmin(u);
export const canManageStorage = (u: { role: Role }) => u.role === 'SUPER_ADMIN';
export const canViewAudit = (u: { role: Role }) => isAdmin(u);
export const canCreateAnnouncement = (u: { role: Role }) =>
  isAdmin(u) || u.role === 'REDAKTUR' || u.role === 'PRODUSER_PUSAT' || u.role === 'PRODUSER_DAERAH';

/**
 * Role yang boleh dibuat & dikelola oleh Produser Daerah: HANYA anggota biro sendiri.
 * Saat ini: Reporter Daerah, Magang, dan Kontributor (sesuai kebutuhan lapangan).
 * Produser Daerah lain tidak dapat dibuat/diubah dari halaman ini.
 */
export const BUREAU_MANAGED_ROLES: Role[] = ['REPORTER_DAERAH', 'MAGANG', 'KONTRIBUTOR'];

/** Apakah aktor boleh mengelola akun di dalam biro-nya sendiri (create/update/nonaktif). */
export const canManageBureauUsers = (actor: { role: Role }): boolean =>
  actor.role === 'PRODUSER_DAERAH' || isAdmin(actor);

/**
 * Role yang boleh dikelola aktor pada konteks BIRO (halaman Pengguna Biro).
 * - Produser Daerah: Reporter Daerah, Magang, Kontributor pada biro-nya.
 * - Admin/Super Admin: seluruh role daerah (mereka juga dapat mengelola semua biro).
 */
export function bureauAssignableRoles(actor: { role: Role }): Role[] {
  if (isAdmin(actor)) {
    return ['PRODUSER_DAERAH', 'REPORTER_DAERAH', 'KONTRIBUTOR', 'MAGANG'].filter((r) =>
      assignableRoles(actor).includes(r as Role)
    ) as Role[];
  }
  return actor.role === 'PRODUSER_DAERAH' ? [...BUREAU_MANAGED_ROLES] : [];
}

/**
 * Batas akses Produser Daerah terhadap satu akun sasaran.
 * Semua syarat harus benar: akun ada di biro yang sama, role-nya termasuk yang boleh
 * dikelola, dan bukan dirinya sendiri.
 */
export function canManageBureauMember(
  actor: { id: string; role: Role; bureauId: string | null },
  target: { id: string; role: Role; bureauId: string | null }
): boolean {
  if (isAdmin(actor)) return true;
  if (actor.role !== 'PRODUSER_DAERAH') return false;
  if (!actor.bureauId || target.bureauId !== actor.bureauId) return false;
  if (target.id === actor.id) return false;
  return BUREAU_MANAGED_ROLES.includes(target.role);
}

/**
 * Role yang boleh dibuat pada pengelolaan pengguna GLOBAL (halaman Pengguna & Hak Akses).
 *
 * PENGAMAN: aktor yang bukan Admin/Super Admin TIDAK PERNAH mendapat daftar luas —
 * mereka hanya mendapat wewenang lingkup biro (`bureauAssignableRoles`) atau daftar kosong.
 * Ini mencegah eskalasi wewenang bila kelak halaman global dibuka untuk role lain.
 */
export function assignableRoles(actor: { role: Role }): Role[] {
  const regionalAndEditorial: Role[] = [
    'REDAKTUR',
    'PRODUSER_PUSAT',
    'REPORTER_PUSAT',
    'PRODUSER_DAERAH',
    'REPORTER_DAERAH',
    'KONTRIBUTOR',
    'MAGANG',
    'KOORDINATOR_LIPUTAN',
    'KOORDINATOR_DAERAH',
  ];
  if (actor.role === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'ADMIN', ...regionalAndEditorial];
  if (actor.role === 'ADMIN') return regionalAndEditorial;
  // Di luar Admin/Super Admin: batasi ke wewenang lingkup biro saja.
  return actor.role === 'PRODUSER_DAERAH' ? [...BUREAU_MANAGED_ROLES] : [];
}

/** Tab yang ditampilkan di halaman Tabulasi Berita sesuai peran. */
export type PoolTab = { key: 'pusat' | 'daerah' | 'saya' | 'pending' | 'nasional'; label: string };

export function poolTabsFor(user: { role: Role }): PoolTab[] {
  if (canViewAllPools(user)) {
    return [
      { key: 'pusat', label: 'Tabulasi Pusat' },
      { key: 'daerah', label: 'Tabulasi Daerah' },
      { key: 'pending', label: 'Menunggu Persetujuan' },
      { key: 'nasional', label: 'Siaran Nasional' },
      { key: 'saya', label: 'Kiriman Saya' },
    ];
  }
  if (isCentralRole(user.role)) {
    return [
      { key: 'pusat', label: 'Tabulasi Pusat' },
      { key: 'pending', label: 'Menunggu Persetujuan' },
      { key: 'nasional', label: 'Siaran Nasional' },
      { key: 'saya', label: 'Kiriman Saya' },
    ];
  }
  if (user.role === 'MAGANG') {
    return [
      { key: 'saya', label: 'Kiriman Saya' },
      { key: 'pusat', label: 'Tabulasi Pusat' },
    ];
  }
  return [
    { key: 'daerah', label: 'Tabulasi Daerah' },
    { key: 'pusat', label: 'Tabulasi Pusat' },
    { key: 'pending', label: 'Menunggu Persetujuan' },
    { key: 'nasional', label: 'Siaran Nasional' },
    { key: 'saya', label: 'Kiriman Saya' },
  ];
}

/** Tab default yang boleh diakses (untuk validasi query param). */
export const allowedTabKeys = (user: { role: Role }) => poolTabsFor(user).map((t) => t.key);
