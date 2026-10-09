import Link from 'next/link';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { assignableRoles, canManageUsers } from '@/lib/permissions';
import { ALL_ROLES, ROLE_LABELS, ROLE_SCOPE } from '@/lib/constants';
import { formatDateTimeID, timeAgo } from '@/lib/utils';
import { createUserAction } from '@/actions/users';
import ActionForm from '@/components/forms/ActionForm';
import SettingsNav from '@/components/layout/SettingsNav';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pengguna & Hak Akses' };

export default async function PenggunaPage() {
  const actor = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const [users, bureaus] = await Promise.all([
    prisma.user.findMany({
      include: { bureau: { select: { name: true, code: true } }, _count: { select: { news: true } } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    }),
    prisma.bureau.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  const allowed = assignableRoles(actor);
  const roleOptions = ALL_ROLES.filter((r) => allowed.includes(r));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">Pengguna &amp; Hak Akses</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          {users.length} pengguna terdaftar · {canManageUsers(actor) ? 'Anda dapat membuat & mengubah akun.' : ''}
        </p>
      </header>

      <SettingsNav user={actor} active="pengguna" />

      <section className="panel shadow-soft overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <h2 className="text-[13.5px] font-bold">Daftar Pengguna</h2>
          <span className="text-[11.5px] text-muted">Kolom “Cakupan” menjelaskan pool data yang dapat diakses</span>
        </div>
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Nama &amp; Email</th>
                <th style={{ width: 150 }}>Role</th>
                <th style={{ width: 150 }}>Biro</th>
                <th style={{ width: 210 }}>Cakupan Data</th>
                <th className="text-right" style={{ width: 70 }}>
                  Berita
                </th>
                <th style={{ width: 130 }}>Terakhir Masuk</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 76 }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-[11px] text-muted">{u.email}</p>
                    {u.jobTitle ? <p className="text-[11px] text-muted">{u.jobTitle}</p> : null}
                  </td>
                  <td>
                    <span className="badge badge-muted">{ROLE_LABELS[u.role]}</span>
                  </td>
                  <td className="text-[12px]">{u.bureau ? `${u.bureau.name}` : <span className="text-muted">Pusat</span>}</td>
                  <td className="text-[11.5px] text-muted">
                    {ROLE_SCOPE[u.role] === 'SEMUA'
                      ? 'Seluruh pool (pusat & daerah)'
                      : ROLE_SCOPE[u.role] === 'PUSAT'
                        ? 'Pool pusat + berita didorong ke pusat'
                        : u.role === 'MAGANG'
                          ? 'Hanya kiriman sendiri'
                          : 'Biro sendiri + pool pusat'}
                  </td>
                  <td className="mono text-right">{u._count.news}</td>
                  <td className="text-[11.5px] text-muted">
                    {u.lastLoginAt ? `${timeAgo(u.lastLoginAt)}` : 'belum pernah'}
                    {u.lastLoginAt ? <span className="block">{formatDateTimeID(u.lastLoginAt)}</span> : null}
                  </td>
                  <td>
                    <span className={u.isActive ? 'badge badge-ok' : 'badge badge-danger'}>
                      {u.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="text-right">
                    <Link href={`/dashboard/pengaturan/pengguna/${u.id}`} className="btn btn-sm">
                      <Icon name="edit" size={12} /> Ubah
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel shadow-soft p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
          <Icon name="users" size={15} className="text-muted" /> Tambah Pengguna
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionForm action={createUserAction} submitLabel="Buat Akun" pendingText="Membuat…" className="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="u-name">
                Nama lengkap *
              </label>
              <input id="u-name" name="name" className="input" placeholder="Nama reporter" />
            </div>
            <div>
              <label className="label" htmlFor="u-email">
                Email *
              </label>
              <input id="u-email" name="email" type="email" className="input" placeholder="nama@garuda.tv" />
            </div>
            <div>
              <label className="label" htmlFor="u-role">
                Role *
              </label>
              <select id="u-role" name="role" className="select" defaultValue="REPORTER_DAERAH">
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="u-bureau">
                Biro (untuk role daerah)
              </label>
              <select id="u-bureau" name="bureauId" className="select" defaultValue="">
                <option value="">— Pusat / tidak perlu —</option>
                {bureaus.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="u-job">
                Jabatan
              </label>
              <input id="u-job" name="jobTitle" className="input" placeholder="Reporter Biro Medan" />
            </div>
            <div>
              <label className="label" htmlFor="u-phone">
                Telepon
              </label>
              <input id="u-phone" name="phone" className="input" placeholder="0811…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="u-pass">
                Sandi awal * (min 8, huruf besar/kecil + angka)
              </label>
              <input id="u-pass" name="password" className="input" placeholder="Min. 8 karakter" />
            </div>
          </ActionForm>
        </div>
        <p className="hint mt-2">
          Pengguna baru wajib mengganti sandi saat pertama masuk. Role yang dapat Anda buat:{' '}
          {roleOptions.map((r) => ROLE_LABELS[r]).join(', ')}.
        </p>
      </section>
    </div>
  );
}
