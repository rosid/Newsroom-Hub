import { prisma } from './prisma';
import { canManageAccount, type AccountGuardResult, type AccountScope } from './permissions';
import type { Role } from '@prisma/client';

/**
 * Penjaga perubahan akun (SERVER ONLY).
 *
 * Melengkapi aturan murni `canManageAccount()` (permissions.ts) dengan satu aturan yang
 * butuh data dari database: **Super Admin aktif terakhir tidak boleh dihapus, diturunkan,
 * atau dinonaktifkan** — kalau tidak, tidak ada lagi akun yang berwenang mengelola admin,
 * storage, dan pengaturan Master, sehingga platform terkunci permanen.
 *
 * Sebelumnya pengaman ini hanya ada pada jalur HAPUS (`deleteUserAction`), sedangkan
 * jalur UBAH ROLE dan NONAKTIFKAN tidak memilikinya (temuan audit lanjutan A-2).
 *
 * Semua action pengelolaan akun WAJIB memakai fungsi ini — jangan menulis ulang
 * pemeriksaannya, karena justru duplikasi itulah penyebab celah A-2 muncul di satu jalur
 * tetapi tidak di jalur lain.
 */

export const LAST_SUPER_ADMIN_MSG =
  'Ini Super Admin aktif terakhir — perannya tidak dapat diturunkan atau dinonaktifkan agar platform tidak terkunci. ' +
  'Angkat Super Admin lain lebih dahulu.';

export const LAST_SUPER_ADMIN_DELETE_MSG = 'Super Admin terakhir tidak dapat dihapus.';

/** Jumlah Super Admin yang masih AKTIF. */
export async function countActiveSuperAdmins(): Promise<number> {
  return prisma.user.count({ where: { role: 'SUPER_ADMIN', isActive: true } });
}

/**
 * Apakah perubahan ini akan menghabiskan Super Admin aktif terakhir?
 * Mengembalikan pesan penolakan, atau null bila aman.
 */
async function lastActiveSuperAdminGuard(target: {
  role: Role;
  isActive: boolean;
  action: 'update' | 'delete';
  nextRole?: Role;
  nextActive?: boolean;
}): Promise<string | null> {
  // Aman bila sasaran bukan Super Admin aktif, atau tetap Super Admin aktif setelah perubahan.
  if (target.role !== 'SUPER_ADMIN' || !target.isActive) return null;
  if (target.action === 'update') {
    const staysSuperAdmin = (target.nextRole ?? target.role) === 'SUPER_ADMIN';
    const staysActive = target.nextActive ?? target.isActive;
    if (staysSuperAdmin && staysActive) return null;
  }
  const total = await countActiveSuperAdmins();
  if (total > 1) return null;
  return target.action === 'delete' ? LAST_SUPER_ADMIN_DELETE_MSG : LAST_SUPER_ADMIN_MSG;
}

type GuardInput = {
  actor: { id: string; role: Role; bureauId?: string | null; name?: string };
  target: { id: string; role: Role; bureauId?: string | null; isActive: boolean };
  /** 'global' = halaman Pengguna & Hak Akses, 'bureau' = halaman Akun Biro. */
  scope?: AccountScope;
  /** Role yang akan diberikan (untuk perubahan role). */
  nextRole?: Role;
  /** Status aktif yang akan diberikan (untuk perubahan status). */
  nextActive?: boolean;
  /** 'delete' memakai pesan khusus Super Admin terakhir. */
  action?: 'update' | 'delete';
};

/**
 * Satu-satunya pemeriksaan otorisasi perubahan akun.
 * Urutan: aturan peran (murni) → Super Admin aktif terakhir (database).
 */
export async function guardAccountChange(input: GuardInput): Promise<AccountGuardResult> {
  const pure = canManageAccount(input.actor, input.target, input.scope ?? 'global');
  if (!pure.ok) return pure;

  const blocked = await lastActiveSuperAdminGuard({
    role: input.target.role,
    isActive: input.target.isActive,
    action: input.action ?? 'update',
    nextRole: input.nextRole,
    nextActive: input.nextActive,
  });
  if (blocked) return { ok: false, reason: blocked };

  return { ok: true };
}
