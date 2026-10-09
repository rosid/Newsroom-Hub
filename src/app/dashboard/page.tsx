import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getDashboardSummary, getStats } from '@/lib/news';
import { ROLE_LABELS, STATUS_BADGE, STATUS_LABELS } from '@/lib/constants';
import { parseDateRange, timeAgo } from '@/lib/utils';
import StatsCards from '@/components/news/StatsCards';
import AnnouncementBanner from '@/components/news/AnnouncementBanner';
import Icon from '@/components/ui/Icon';
import { poolTabsFor } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

export default async function DashboardHome() {
  const user = await requireUser();
  const [stats, summary] = await Promise.all([getStats(user), getDashboardSummary(user)]);
  const range = parseDateRange({});
  const tabs = poolTabsFor(user);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
            {ROLE_LABELS[user.role]}
            {user.bureau ? ` · ${user.bureau.name}` : ' · Pusat'}
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">
            Selamat bertugas, {user.name.split(' ')[0]}.
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Ringkasan pemberitaan Anda dalam 7 hari terakhir · {summary.week} kiriman dalam cakupan akses.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/kirim" className="btn btn-primary btn-sm">
            <Icon name="plus" size={14} /> Kirim Berita
          </Link>
          <Link href="/dashboard/tabulasi" className="btn btn-sm">
            <Icon name="list" size={14} /> Buka Tabulasi
          </Link>
        </div>
      </header>

      {/* Pengumuman redaksi — paling atas, berlatar merah agar mudah terlihat */}
      <AnnouncementBanner announcements={summary.announcements} />

      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* Kiriman terbaru */}
        <section className="panel shadow-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <h2 className="text-[13.5px] font-bold">Kiriman Terbaru</h2>
            <Link href="/dashboard/tabulasi?tab=saya" className="text-[11.5px] font-semibold text-accent hover:underline">
              Lihat semua
            </Link>
          </div>
          {summary.recent.length ? (
            <ul className="divide-y divide-[var(--line-soft)]">
              {summary.recent.map((n) => (
                <li key={n.id}>
                  <Link href={`/dashboard/tabulasi/berita/${n.id}`} className="flex flex-col gap-1.5 px-3 py-2.5 hover:bg-panel2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] font-semibold leading-snug">
                        {n.kind === 'BREAKING' ? <span className="badge badge-danger mr-1.5 !py-0">BREAKING</span> : null}
                        {n.title}
                      </p>
                      <span className={STATUS_BADGE[n.status]}>{STATUS_LABELS[n.status]}</span>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
                      <span className="mono">{n.code}</span>
                      <span>· {n.category}</span>
                      <span>· {n.author.name}</span>
                      {n.bureau ? <span>· {n.bureau.name}</span> : null}
                      <span>· {n._count.media} lampiran</span>
                      <span>· {timeAgo(n.createdAt)}</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-10 text-center text-[12.5px] text-muted">Belum ada berita dalam cakupan akses Anda.</p>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {/* Alur kerja */}
          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 text-[13.5px] font-bold">Alur Kerja Berita</h2>
            <ol className="flex flex-col gap-2.5">
              {[
                { t: 'Reporter kirim naskah + footage', d: 'Status: Menunggu Persetujuan' },
                { t: 'Produser validasi', d: 'Terverifikasi / Perlu Revisi / Ditolak' },
                { t: 'Dorong ke Pusat bila layak nasional', d: 'Muncul di Tabulasi Pusat' },
                { t: 'Redaktur siarkan', d: 'Status: Disiarkan (nasional/daerah)' },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-2.5">
                  <span
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-white"
                    style={{ background: i === 3 ? 'var(--ok)' : 'var(--accent)' }}
                  >
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-[12.5px] font-semibold">{s.t}</span>
                    <span className="block text-[11px] text-muted">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {tabs.map((t) => (
                <Link key={t.key} href={`/dashboard/tabulasi?tab=${t.key}`} className="btn btn-sm">
                  {t.label}
                </Link>
              ))}
            </div>
          </section>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 text-[13.5px] font-bold">Cakupan Data Anda</h2>
            <dl className="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <dt className="text-muted">Kiriman saya</dt>
                <dd className="text-[16px] font-bold">{summary.mine}</dd>
              </div>
              <div>
                <dt className="text-muted">Berita hari ini</dt>
                <dd className="text-[16px] font-bold">{stats.totalToday}</dd>
              </div>
              <div>
                <dt className="text-muted">Periode laporan</dt>
                <dd className="font-semibold">
                  {range.fromStr} – {range.toStr}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Notifikasi belum dibaca</dt>
                <dd className="text-[16px] font-bold">{summary.unread}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
