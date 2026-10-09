import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { assignableRoles } from '@/lib/permissions';
import { ROLE_LABELS, ROLE_SCOPE } from '@/lib/constants';
import { formatDateTimeID, numberID } from '@/lib/utils';
import { updateUserAction, toggleUserActiveAction, deleteUserAction } from '@/actions/users';
import ActionForm from '@/components/forms/ActionForm';
import SettingsNav from '@/components/layout/SettingsNav';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';

export default async function EditPenggunaPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    include: { bureau: true, _count: { select: { news: true, notifications: true } } },
  });
  if (!target) notFound();

  const [bureaus, logs] = await Promise.all([
    prisma.bureau.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.auditLog.findMany({ where: { actorId: id }, orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);

  const roleOptions = assignableRoles(actor);
  const lockedRole = (target.role === 'SUPER_ADMIN' || target.role === 'ADMIN') && actor.role !== 'SUPER_ADMIN';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <Link href="/dashboard/pengaturan/pengguna" className="inline-flex items-center gap-1 hover:text-accent">
          <Icon name="back" size={13} /> Pengguna
        </Link>
        <span>/</span>
        <span>{target.name}</span>
      </div>

      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">{target.name}</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          {ROLE_LABELS[target.role]}
          {target.bureau ? ` · ${target.bureau.name}` : ' · Pusat'} · {target.email}
        </p>
      </header>

      <SettingsNav user={actor} active="pengguna" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel shadow-soft p-4">
          <h2 className="mb-3 text-[14px] font-bold">Ubah Data &amp; Hak Akses</h2>
          {lockedRole ? (
            <p className="mb-3 rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-muted">
              Hanya Super Admin yang dapat mengubah akun admin/super admin. Anda tetap dapat melihat datanya.
            </p>
          ) : null}

          <ActionForm
            action={updateUserAction}
            submitLabel="Simpan Perubahan"
            pendingText="Menyimpan…"
            hideSubmit={lockedRole}
          >
            <input type="hidden" name="id" value={target.id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Nama lengkap *</label>
                <input name="name" className="input" defaultValue={target.name} disabled={lockedRole} />
              </div>
              <div>
                <label className="label">Email (tidak dapat diubah)</label>
                <input className="input" defaultValue={target.email} disabled />
              </div>
              <div>
                <label className="label">Role *</label>
                <select name="role" className="select" defaultValue={target.role} disabled={lockedRole}>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                  {!roleOptions.includes(target.role) ? (
                    <option value={target.role}>{ROLE_LABELS[target.role]}</option>
                  ) : null}
                </select>
              </div>
              <div>
                <label className="label">Biro</label>
                <select name="bureauId" className="select" defaultValue={target.bureauId ?? ''} disabled={lockedRole}>
                  <option value="">— Pusat / tidak perlu —</option>
                  {bureaus.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Jabatan</label>
                <input name="jobTitle" className="input" defaultValue={target.jobTitle ?? ''} disabled={lockedRole} />
              </div>
              <div>
                <label className="label">Telepon</label>
                <input name="phone" className="input" defaultValue={target.phone ?? ''} disabled={lockedRole} />
              </div>
            </div>

            <div>
              <label className="label">Sandi baru (opsional — reset sandi)</label>
              <input
                name="newPassword"
                className="input"
                placeholder="Kosongkan bila tidak diubah"
                disabled={lockedRole}
              />
              <p className="hint">Bila diisi: minimal 8 karakter dengan huruf besar, kecil, dan angka.</p>
            </div>

            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" name="isActive" defaultChecked={target.isActive} disabled={lockedRole || target.id === actor.id} />
              Akun aktif (dapat masuk)
            </label>
          </ActionForm>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <ActionForm
              action={toggleUserActiveAction}
              submitLabel={target.isActive ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
              buttonClassName="btn"
              className="contents"
              pendingText="…"
            >
              <input type="hidden" name="id" value={target.id} />
            </ActionForm>
            <ActionForm
              action={deleteUserAction}
              submitLabel="Hapus Akun"
              buttonClassName="btn btn-danger"
              className="contents"
              pendingText="…"
            >
              <input type="hidden" name="id" value={target.id} />
            </ActionForm>
          </div>
          <p className="hint mt-2">
            Akun yang memiliki riwayat berita tidak dapat dihapus (data pemberitaan harus tetap utuh) — gunakan
            Nonaktifkan.
          </p>
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 text-[14px] font-bold">Ringkasan Akun</h2>
            <dl className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-muted">Role</dt>
                <dd>{ROLE_LABELS[target.role]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Cakupan data</dt>
                <dd className="text-right">
                  {ROLE_SCOPE[target.role] === 'SEMUA'
                    ? 'Seluruh pool'
                    : ROLE_SCOPE[target.role] === 'PUSAT'
                      ? 'Pool pusat + dorongan'
                      : target.role === 'MAGANG'
                        ? 'Hanya kiriman sendiri'
                        : 'Biro sendiri + pool pusat'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Jumlah berita</dt>
                <dd className="mono">{numberID(target._count.news)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Dibuat</dt>
                <dd>{formatDateTimeID(target.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Terakhir masuk</dt>
                <dd>{target.lastLoginAt ? formatDateTimeID(target.lastLoginAt) : 'belum pernah'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Wajib ganti sandi</dt>
                <dd>{target.mustChangePass ? 'Ya' : 'Tidak'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 text-[14px] font-bold">Aktivitas Terakhir</h2>
            {logs.length ? (
              <ul className="flex flex-col gap-2 text-[12px]">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3">
                    <span className="font-medium">{l.action}</span>
                    <span className="text-right text-muted">{formatDateTimeID(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted">Belum ada aktivitas tercatat.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
