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
/**
 * Role yang HANYA boleh melihat berita BUATANNYA SENDIRI — tidak melihat kiriman orang lain,
 * baik dari biro maupun dari pusat.
 *
 * Perubahan Okt 2026 (permintaan pemilik aplikasi). Sebelumnya: Reporter Pusat melihat seluruh
 * pool pusat, Reporter Daerah & Kontributor melihat biro-nya + pool pusat, dan hanya Magang yang
 * terbatas pada kiriman sendiri. Sekarang KEEMPAT role ini setara — kiriman sendiri saja.
 *
 * Ditulis sebagai satu daftar agar tidak ada perbedaan aturan antar-tempat; jangan menambahkan
 * pemeriksaan "authorId === user.id" yang tersebar, pakai `seesOnlyOwnNews()`.
 */
export const OWN_NEWS_ONLY_ROLES: Role[] = ['REPORTER_PUSAT', 'REPORTER_DAERAH', 'KONTRIBUTOR', 'MAGANG'];

/** True bila role ini hanya boleh melihat berita yang ia buat sendiri. */
export const seesOnlyOwnNews = (u: { role: Role }): boolean => OWN_NEWS_ONLY_ROLES.includes(u.role);
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
 * - Reporter Pusat/Daerah, Kontributor, Magang : HANYA kiriman miliknya sendiri —
 *   tidak melihat kiriman orang lain, baik dari biro maupun pusat (lihat OWN_NEWS_ONLY_ROLES).
 * - Redaktur/Produser Pusat/Koordinator : HANYA pool pusat + berita daerah yang sudah
 *   DORONG KE PUSAT. Tidak bisa melihat tabulasi daerah (sesuai permintaan).
 * - Produser Daerah : pool biro-nya sendiri + pool pusat (yang terverifikasi/disiarkan).
 */
export function newsVisibilityWhere(user: CurrentUser): Prisma.NewsWhereInput {
  if (canViewAllPools(user)) return {};

  // PENTING: diletakkan SEBELUM cabang pusat/daerah. Bila ditaruh sesudahnya, Reporter Pusat
  // akan lebih dulu mendapat `{ OR: [pool pusat, didorong ke pusat] }` sehingga masih bisa
  // melihat kiriman orang lain (celah yang justru ingin dihilangkan).
  if (seesOnlyOwnNews(user)) return { authorId: user.id };

  const centralVisible: Prisma.NewsWhereInput = {
    OR: [{ originPool: Pool.PUSAT }, { isPushedToCenter: true }],
    status: { in: CENTRAL_VISIBLE_TO_REGION },
  };

  if (isCentralRole(user.role)) {
    return { OR: [{ originPool: Pool.PUSAT }, { isPushedToCenter: true }] };
  }

  // (Cabang khusus MAGANG dihapus: Magang sudah ditangani `seesOnlyOwnNews` di atas.)

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
  // Reporter/Kontributor/Magang: hanya kiriman sendiri — termasuk terhadap rekan SEBIRO.
  // Dipakai halaman detail, tautan berbagi, dan pemuatan lampiran.
  if (seesOnlyOwnNews(user)) return news.authorId === user.id;
  if (news.authorId === user.id) return true;
  if (isCentralRole(user.role)) {
    return news.originPool === Pool.PUSAT || news.isPushedToCenter;
  }
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

/**
 * Role yang boleh membuka halaman LISTING BERITA (berita biro yang didorong ke pusat).
 *
 * Diminta pemilik aplikasi: semua role KECUALI Reporter Daerah, Reporter Pusat,
 * Kontributor, dan Magang. Admin/Super Admin, Redaktur, Produser (Pusat & Daerah),
 * serta kedua Koordinator termasuk.
 *
 * Ditulis sebagai daftar role YANG DIIZINKAN (allow-list) — bukan daftar pengecualian —
 * supaya role baru tidak otomatis mendapat akses tanpa keputusan sadar.
 */
export const LISTING_ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'REDAKTUR',
  'PRODUSER_PUSAT',
  'PRODUSER_DAERAH',
  'KOORDINATOR_LIPUTAN',
  'KOORDINATOR_DAERAH',
];

export const canViewListing = (u: { role: Role }): boolean => LISTING_ROLES.includes(u.role);

export const canManageUsers = (u: { role: Role }) => isAdmin(u);
export const canManageBureau = (u: { role: Role }) => isAdmin(u);
export const canManageMaster = (u: { role: Role }) => isAdmin(u);
/**
 * Wewenang mengelola KONFIGURASI STORAGE (kredensial penyedia penyimpanan footage).
 *
 * KEPUTUSAN (audit Okt 2026 — A-3): sebelumnya fungsi ini menyatakan `SUPER_ADMIN`
 * SAJA, padahal ketiga action storage (`testStorageAction`, `saveStorageSettingsAction`,
 * `resetStorageAction`) memakai `requireRole(['SUPER_ADMIN','ADMIN'])` — dua aturan yang
 * berbeda, dan fungsi ini tidak pernah dipakai sama sekali (dead code). Diselaraskan ke
 * level Admin karena: (1) ADMIN memang pengelola penuh lainnya (pengguna, biro, kategori,
 * log audit, seluruh pool berita), (2) akun yang dipakai pemilik aplikasi sehari-hari
 * ber-role ADMIN dan memang mengonfigurasi storage ini, (3) sejalan dengan
 * canManageBureau/canViewAudit/canManageUsers.
 *
 * Fungsi ini adalah SATU-SATUNYA sumber kebenaran: dipakai halaman Storage & Integrasi,
 * menu sidebar, dan ketiga action tersebut. Bila kelak ingin dikunci hanya untuk Super
 * Admin, cukup ubah baris ini menjadi `u.role === 'SUPER_ADMIN'`.
 */
export const canManageStorage = (u: { role: Role }) => isAdmin(u);
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
 * ============================================================================
 * ATURAN PENGELOLAAN AKUN — SATU SUMBER KEBENARAN
 * ============================================================================
 *
 * Dipakai oleh SEMUA jalur yang dapat mengubah akun orang lain:
 *  - halaman Pengguna & Hak Akses  (scope 'global')
 *  - halaman Akun Biro Saya        (scope 'bureau')
 *
 * Kenapa dijadikan satu fungsi: temuan audit A-2 (Okt 2026) terjadi karena aturan ini
 * ditulis ULANG secara terpisah di tiap action — jalur "Akun Biro" tidak memiliki
 * pengaman "hanya Super Admin boleh menyentuh akun admin", sehingga seorang ADMIN dapat
 * menurunkan role + menetapkan sandi baru akun SUPER_ADMIN (ambil alih akun puncak).
 * JANGAN menulis ulang aturan ini di action mana pun; panggil fungsi ini.
 */
export type AccountScope = 'global' | 'bureau';

export type AccountGuardResult =
  | { ok: true }
  | { ok: false; reason: string; fieldErrors?: Record<string, string> };

/** Pesan tunggal untuk penolakan akun admin (dipakai juga oleh uji regresi). */
export const ACCOUNT_ADMIN_PROTECTED_MSG = 'Hanya Super Admin yang dapat mengubah akun admin/super admin.';
/** Pesan tunggal untuk penolakan akun sendiri. */
export const ACCOUNT_SELF_MSG = 'Anda tidak dapat mengubah akun Anda sendiri dari halaman ini.';

/**
 * Bolehkah `actor` mengelola akun `target`?
 *
 * - Tak seorang pun mengelola akunnya SENDIRI dari halaman pengelolaan (cegah terkunci
 *   sendiri maupun menaikkan/menurunkan wewenang sendiri).
 * - Akun ADMIN & SUPER_ADMIN hanya boleh disentuh SUPER_ADMIN (inti perbaikan A-2).
 * - SUPER_ADMIN: boleh mengelola akun siapa pun selain dirinya.
 * - ADMIN:
 *     scope 'global' → boleh mengelola seluruh akun NON-admin (termasuk role editorial/pusat);
 *     scope 'bureau' → HANYA akun yang memang termasuk role yang boleh dikelola pada
 *                      halaman akun biro (`bureauAssignableRoles`), yaitu akun ber-biro.
 * - PRODUSER_DAERAH (scope 'bureau'): hanya anggota biro-nya sendiri dengan role yang diizinkan.
 * - Role lain: tidak boleh mengelola akun siapa pun.
 *
 * CATATAN: fungsi ini MURNI (tanpa akses database) supaya aman dipakai di komponen.
 * Aturan yang butuh data (mis. "Super Admin aktif terakhir") ada di `lib/account-guard.ts`.
 */
export function canManageAccount(
  actor: { id: string; role: Role; bureauId?: string | null },
  target: { id: string; role: Role; bureauId?: string | null },
  scope: AccountScope = 'global'
): AccountGuardResult {
  if (target.id === actor.id) return { ok: false, reason: ACCOUNT_SELF_MSG };
  if (isAdmin(target) && !isSuperAdmin(actor)) {
    return { ok: false, reason: ACCOUNT_ADMIN_PROTECTED_MSG };
  }
  if (isSuperAdmin(actor)) return { ok: true };

  if (scope === 'bureau') {
    const targetBureauId = target.bureauId ?? null;
    if (actor.role === 'ADMIN') {
      // Halaman akun biro hanya untuk akun biro — Admin tetap dapat mengelola role
      // editorial/pusat lewat halaman Pengguna (scope 'global'), bukan lewat form biro.
      if (!targetBureauId) {
        return { ok: false, reason: 'Halaman ini hanya untuk akun biro daerah. Gunakan halaman Pengguna & Hak Akses.' };
      }
      if (!bureauAssignableRoles(actor).includes(target.role)) {
        return {
          ok: false,
          reason: 'Role akun tersebut bukan role akun biro yang dapat dikelola dari halaman ini.',
          fieldErrors: { role: 'Role tidak dapat dikelola dari halaman akun biro' },
        };
      }
      return { ok: true };
    }
    if (actor.role !== 'PRODUSER_DAERAH') {
      return { ok: false, reason: 'Anda tidak berhak mengelola akun pengguna.' };
    }
    if (!actor.bureauId || targetBureauId !== actor.bureauId) {
      return { ok: false, reason: 'Anda hanya dapat mengelola akun pada biro Anda sendiri.' };
    }
    if (!BUREAU_MANAGED_ROLES.includes(target.role)) {
      return { ok: false, reason: 'Role akun tersebut tidak dapat Anda kelola.' };
    }
    return { ok: true };
  }

  // scope 'global' — hanya ADMIN yang sampai di sini (SUPER_ADMIN sudah keluar di atas).
  if (actor.role !== 'ADMIN') return { ok: false, reason: 'Anda tidak berhak mengelola akun pengguna.' };
  return { ok: true };
}

/**
 * Pembungkus boolean untuk pemakaian di tampilan (mis. menyembunyikan tombol).
 * Delegasi ke `canManageAccount` agar tidak pernah berbeda aturan.
 */
export function canManageBureauMember(
  actor: { id: string; role: Role; bureauId: string | null },
  target: { id: string; role: Role; bureauId: string | null }
): boolean {
  return canManageAccount(actor, target, 'bureau').ok;
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
