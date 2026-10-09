import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { canManageBureauUsers, bureauAssignableRoles, isAdmin, BUREAU_MANAGED_ROLES } from '@/lib/permissions';
import { ROLE_LABELS, roleListText } from '@/lib/constants';
import SettingsNav from '@/components/layout/SettingsNav';
import BureauUsersManager, { type BureauMember } from '@/components/forms/BureauUsersManager';
import Icon from '@/components/ui/Icon';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Akun Biro' };

/**
 * Halaman manajemen akun LINGKUP BIRO.
 * - Produser Daerah: hanya anggota biro-nya (Reporter Daerah & Magang).
 * - Admin/Super Admin: dapat memilih biro & role daerah lainnya.
 */
export default async function BureauUsersPage() {
  const user = await requireUser();

  if (!canManageBureauUsers(user)) {
    return (
      <div className="panel shadow-soft mx-auto max-w-lg p-6 text-center">
        <Icon name="lock" size={22} className="mx-auto text-muted" />
        <h1 className="mt-2 text-[16px] font-bold">Akses ditolak</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Pembuatan akun anggota biro hanya tersedia untuk Produser Daerah (biro sendiri) dan Admin Redaksi.
        </p>
        <Link href="/dashboard" className="btn btn-primary mt-4">
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  const admin = isAdmin(user);
  const roleOptions = bureauAssignableRoles(user) as Role[];

  // Produser Daerah: WAJIB punya biro. Admin dapat melihat/mengelola biro mana pun
  // (default: biro akunnya sendiri bila ada).
  const bureaus = admin
    ? await prisma.bureau.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } })
    : [];

  const where = admin
    ? {
        bureauId: { not: null },
        // Akun sendiri tidak dikelola dari halaman ini, dan akun ADMIN/SUPER_ADMIN
        // hanya boleh dikelola Super Admin (audit A-2) — supaya tidak ada tombol
        // yang sudah pasti ditolak server.
        id: { not: user.id },
        ...(user.role === 'SUPER_ADMIN' ? {} : { role: { notIn: ['ADMIN', 'SUPER_ADMIN'] as Role[] } }),
      }
    : { bureauId: user.bureauId ?? '__none__', role: { in: BUREAU_MANAGED_ROLES } };

  const rows = await prisma.user.findMany({
    where,
    include: { _count: { select: { news: true } } },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });

  const members: BureauMember[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    jobTitle: u.jobTitle,
    phone: u.phone,
    isActive: u.isActive,
    mustChangePass: u.mustChangePass,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    newsCount: u._count.news,
  }));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">
          {admin ? 'Akun Biro Daerah' : `Akun Biro: ${user.bureau?.name ?? '-'}`}
        </h1>
        <p className="mt-1 text-[12.5px] text-muted">
          {admin ? (
            <>Kelola akun anggota seluruh biro daerah ({roleListText(
              ['PRODUSER_DAERAH', 'REPORTER_DAERAH', 'KONTRIBUTOR', 'MAGANG'] as Role[],
            )}).</>
          ) : (
            <>
              Anda dapat membuat &amp; mengelola akun <strong>{roleListText(BUREAU_MANAGED_ROLES)}</strong> untuk{' '}
              <strong>{user.bureau?.name ?? '-'}</strong>. Akun otomatis ditempatkan di biro Anda — tidak bisa
              lintas biro.
            </>
          )}
        </p>
      </header>

      <SettingsNav user={user} active="pengguna-biro" />

      {!admin && !user.bureauId ? (
        <div className="panel shadow-soft p-5 text-center">
          <Icon name="alert" size={20} className="mx-auto text-muted" />
          <p className="mt-2 text-[13px] font-semibold">Akun Anda belum terhubung ke biro</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Hubungi Admin Redaksi untuk menghubungkan akun Anda dengan biro, lalu buka halaman ini kembali.
          </p>
        </div>
      ) : (
        <BureauUsersManager
          members={members}
          roleOptions={roleOptions}
          bureaus={bureaus}
          actorRole={user.role}
          actorBureauName={user.bureau?.name ?? '-'}
        />
      )}

      <p className="text-[11.5px] text-muted">
        Catatan: akun yang sudah memiliki riwayat berita tidak dapat dihapus — gunakan tombol <strong>Nonaktifkan</strong>{' '}
        agar data pemberitaan tetap utuh.
      </p>
    </div>
  );
}
