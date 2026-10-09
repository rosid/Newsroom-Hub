import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { ROLE_LABELS, ROLE_SCOPE } from '@/lib/constants';
import { formatDateTimeID, numberID } from '@/lib/utils';
import { updateProfileAction } from '@/actions/account';
import ActionForm from '@/components/forms/ActionForm';
import ChangePasswordForm from '@/components/forms/ChangePasswordForm';
import SettingsNav from '@/components/layout/SettingsNav';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Akun & Profil' };

export default async function AkunPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const [newsCount, published, notifications] = await Promise.all([
    prisma.news.count({ where: { authorId: user.id } }),
    prisma.news.count({ where: { authorId: user.id, status: 'PUBLISHED' } }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);

  const scopeText =
    ROLE_SCOPE[user.role] === 'SEMUA'
      ? 'Seluruh pool: pusat & semua biro daerah'
      : ROLE_SCOPE[user.role] === 'PUSAT'
        ? 'Pool pusat + berita daerah yang didorong ke pusat'
        : user.role === 'MAGANG'
          ? 'Hanya kiriman sendiri'
          : `Biro ${user.bureau?.name ?? '-'} + pool pusat`;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">Akun &amp; Profil</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Perbarui data pribadi dan sandi akun Anda. Perubahan langsung berlaku untuk sesi berikutnya.
        </p>
      </header>

      <SettingsNav user={user} active="akun" />

      {user.mustChangePass ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--warn)_40%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2 text-[12.5px] text-[color:var(--warn)]">
          <Icon name="alert" size={15} className="mt-[2px] shrink-0" />
          <span>Admin mewajibkan Anda mengganti sandi. Silakan perbarui sandi pada formulir di bawah.</span>
        </p>
      ) : null}

      {sp?.ok ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12.5px] text-[color:var(--ok)]">
          Sandi berhasil diperbarui.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="user" size={15} className="text-muted" /> Profil
            </h2>
            <ActionForm action={updateProfileAction} submitLabel="Simpan Profil" pendingText="Menyimpan…">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Nama lengkap *</label>
                  <input name="name" className="input" defaultValue={user.name} />
                </div>
                <div>
                  <label className="label">Email (tidak dapat diubah)</label>
                  <input className="input" defaultValue={user.email} disabled />
                </div>
                <div>
                  <label className="label">Jabatan</label>
                  <input name="jobTitle" className="input" defaultValue={user.jobTitle ?? ''} placeholder="Reporter Biro Medan" />
                </div>
                <div>
                  <label className="label">Telepon</label>
                  <input name="phone" className="input" defaultValue={user.phone ?? ''} placeholder="0811…" />
                </div>
              </div>
              <div>
                <label className="label">URL foto profil (opsional)</label>
                <input name="avatarUrl" className="input" defaultValue={user.avatarUrl ?? ''} placeholder="https://…" />
              </div>
            </ActionForm>
          </section>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="lock" size={15} className="text-muted" /> Ganti Sandi
            </h2>
            <ChangePasswordForm />
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 text-[14px] font-bold">Informasi Akun</h2>
            <dl className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Role</dt>
                <dd className="font-semibold">{ROLE_LABELS[user.role]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Unit</dt>
                <dd>{user.bureau ? `${user.bureau.name} (${user.bureau.code})` : 'Redaksi Pusat'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Cakupan data</dt>
                <dd className="text-right">{scopeText}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Status</dt>
                <dd>
                  <span className={user.isActive ? 'badge badge-ok' : 'badge badge-danger'}>
                    {user.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Bergabung</dt>
                <dd>{formatDateTimeID(user.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Terakhir masuk</dt>
                <dd>{user.lastLoginAt ? formatDateTimeID(user.lastLoginAt) : '-'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 text-[14px] font-bold">Kontribusi Saya</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="kpi">
                <span className="kpi-label">Berita</span>
                <span className="kpi-value">{numberID(newsCount)}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Disiarkan</span>
                <span className="kpi-value">{numberID(published)}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Notif baru</span>
                <span className="kpi-value">{numberID(notifications)}</span>
              </div>
            </div>
            <Link href="/dashboard/tabulasi?tab=saya" className="btn mt-3 w-full">
              <Icon name="list" size={13} /> Lihat Kiriman Saya
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
