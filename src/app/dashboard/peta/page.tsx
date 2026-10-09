import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getMapPoints, getStats } from '@/lib/news';
import { canViewAllPools } from '@/lib/permissions';
import { parseDateRange, RANGE_OPTIONS, buildQuery, numberID } from '@/lib/utils';
import MapCanvas, { type MapPoint } from '@/components/map/MapCanvas';
import StatsCards from '@/components/news/StatsCards';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Peta Sebaran Berita' };

const LEGEND = [
  { label: 'Breaking News', color: '#e8384a' },
  { label: 'Disiarkan', color: '#16a34a' },
  { label: 'Terverifikasi', color: '#4d7cfe' },
  { label: 'Menunggu', color: '#eab308' },
  { label: 'Perlu revisi', color: '#8b5cf6' },
];

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'breaking', label: 'Breaking' },
  { key: 'nasional', label: 'Siaran Nasional' },
  { key: 'pusat', label: 'Didorong ke Pusat' },
  { key: 'PENDING', label: 'Menunggu' },
  { key: 'VERIFIED', label: 'Terverifikasi' },
  { key: 'PUBLISHED', label: 'Disiarkan' },
];

export default async function PetaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = parseDateRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to) });
  const activeFilter = one(sp.peta) ?? 'all';

  const [points, stats] = await Promise.all([getMapPoints(user, range), getStats(user)]);

  const mapPoints: MapPoint[] = points
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      category: p.category,
      kind: p.kind,
      status: p.status,
      lat: p.latitude as number,
      lng: p.longitude as number,
      location: p.location,
      authorName: p.author.name,
      bureauName: p.bureau?.name ?? null,
      isNational: p.isNational,
      isPushedToCenter: p.isPushedToCenter,
      createdAt: p.createdAt.toISOString(),
    }));

  const byProvince = points.reduce<Record<string, number>>((acc, p) => {
    const key = p.province || p.city || 'Tidak diketahui';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const provinceList = Object.entries(byProvince).sort((a, b) => b[1] - a[1]).slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Peta Sebaran Berita</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Titik geo-tagging dari kiriman reporter{' '}
            {canViewAllPools(user) ? 'seluruh pool' : user.bureau ? `(cakupan ${user.bureau.name} + Pusat)` : '(Pool Pusat)'} ·{' '}
            {numberID(mapPoints.length)} titik ber-geo-tag
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGE_OPTIONS.filter((r) => r.key !== 'custom').map((r) => (
            <Link
              key={r.key}
              href={buildQuery('/dashboard/peta', { range: r.key, peta: activeFilter })}
              className={`btn btn-sm ${range.preset === r.key ? 'btn-accent' : ''}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </header>

      <StatsCards stats={stats} />

      <section className="panel shadow-soft overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2.5">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted">
            <Icon name="filter" size={13} /> Tampilkan
          </span>
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={buildQuery('/dashboard/peta', { range: range.preset, peta: f.key })}
              className={`btn btn-sm ${activeFilter === f.key ? 'btn-primary' : ''}`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_280px]">
          <div className="p-3">
            <MapCanvas points={mapPoints} filterKey={activeFilter} height={560} />
          </div>

          <aside className="border-t border-line p-3 lg:border-l lg:border-t-0">
            <h2 className="mb-2 text-[12.5px] font-bold uppercase tracking-wider text-muted">Legenda Status</h2>
            <ul className="mb-4 flex flex-col gap-1.5">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-center gap-2 text-[12px]">
                  <span className="h-3 w-3 rounded-full border-2 border-white/70" style={{ background: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>

            <h2 className="mb-2 text-[12.5px] font-bold uppercase tracking-wider text-muted">
              Wilayah Terbanyak ({points.length} berita)
            </h2>
            {provinceList.length ? (
              <ul className="flex flex-col gap-1.5">
                {provinceList.map(([name, count]) => (
                  <li key={name} className="flex items-center gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="mono text-muted">{count}</span>
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-panel3">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.round((count / (provinceList[0][1] || 1)) * 100)}%`, background: 'var(--accent)' }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted">Belum ada berita ber-geo-tag pada periode ini.</p>
            )}

            <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
              Tips: reporter mengisi geo-tagging di form Kirim Berita — klik peta atau gunakan lokasi perangkat.
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}
