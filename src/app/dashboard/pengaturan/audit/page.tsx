import Link from 'next/link';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { canViewAudit } from '@/lib/permissions';
import { formatDateTimeID } from '@/lib/utils';
import { p } from '@/lib/base';
import { ROLE_LABELS } from '@/lib/constants';
import Pagination from '@/components/ui/Pagination';
import SettingsNav from '@/components/layout/SettingsNav';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Log Aktivitas' };

const PER_PAGE = 40;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  if (!canViewAudit(user)) return null;

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const action = one(sp.action) ?? '';
  const q = one(sp.q) ?? '';
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);

  const where = {
    ...(action ? { action } : {}),
    ...(q
      ? {
          OR: [
            { actorName: { contains: q } },
            { entityId: { contains: q } },
            { action: { contains: q } },
          ],
        }
      : {}),
  };

  const [total, rows, actionGroups] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { _count: { action: 'desc' } } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">Log Aktivitas</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Jejak audit seluruh tindakan penting: login, kirim berita, validasi, dorong ke pusat, siaran, dan perubahan master.
        </p>
      </header>

      <SettingsNav user={user} active="audit" />

      <section className="panel shadow-soft">
        <form action={p('/dashboard/pengaturan/audit')} method="get" className="flex flex-wrap items-end gap-2 border-b border-line p-3">
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="a-q">
              Cari
            </label>
            <div className="relative">
              <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input id="a-q" name="q" defaultValue={q} className="input !pl-8" placeholder="Nama pelaku, aksi, ID entitas…" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="a-action">
              Jenis aksi
            </label>
            <select id="a-action" name="action" defaultValue={action} className="select !w-[210px]">
              <option value="">Semua aksi</option>
              {actionGroups.map((g) => (
                <option key={g.action} value={g.action}>
                  {g.action} ({g._count._all})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            <Icon name="filter" size={13} /> Filter
          </button>
          <Link href="/dashboard/pengaturan/audit" className="btn">
            Reset
          </Link>
        </form>

        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th style={{ width: 165 }}>Waktu</th>
                <th style={{ width: 190 }}>Pelaku</th>
                <th style={{ width: 190 }}>Aksi</th>
                <th>Entitas</th>
                <th style={{ width: 130 }}>IP</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-[11.5px]">{formatDateTimeID(r.createdAt)}</td>
                  <td>
                    <p className="text-[12.5px] font-medium">{r.actorName}</p>
                    <p className="text-[11px] text-muted">
                      {ROLE_LABELS[r.actorRole as keyof typeof ROLE_LABELS] ?? r.actorRole}
                    </p>
                  </td>
                  <td>
                    <span className="badge badge-muted mono">{r.action}</span>
                  </td>
                  <td className="text-[11.5px] text-muted">
                    <span className="mono">{r.entity}</span>
                    {r.entityId ? <span className="block truncate">{r.entityId.slice(0, 34)}</span> : null}
                  </td>
                  <td className="mono text-[11px] text-muted">{r.ip || '-'}</td>
                  <td className="text-[11px] text-muted">
                    <span className="line-clamp-2">{r.meta || '-'}</span>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted">
                    Tidak ada log pada filter ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pages={pages}
          basePath="/dashboard/pengaturan/audit"
          params={{ q: q || undefined, action: action || undefined }}
        />
      </section>

      <p className="text-[11.5px] text-muted">Total {total} log audit tersimpan.</p>
    </div>
  );
}
