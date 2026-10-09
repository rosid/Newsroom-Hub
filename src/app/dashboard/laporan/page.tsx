import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getAiredNews, getReportBundle } from '@/lib/news';
import { canViewAllPools } from '@/lib/permissions';
import { parseDateRange, RANGE_OPTIONS, buildQuery, numberID, toDateInputValue, formatDateTimeID } from '@/lib/utils';
import { p } from '@/lib/base';
import {
  AirByCategoryChart,
  AirChannelChart,
  BureauChart,
  CategoryChart,
  StatusChart,
  TrendChart,
} from '@/components/dashboard/ReportCharts';
import ExportButtons from '@/components/ui/ExportButtons';
import Icon from '@/components/ui/Icon';
import { AIR_CHANNEL_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan' };

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = parseDateRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to) });
  // Filter kanal untuk tabel "Berita Tayang"
  const kanalParam = one(sp.kanal);
  const kanal: 'ONAIR' | 'MEDSOS' | 'SEMUA' =
    kanalParam === 'onair' ? 'ONAIR' : kanalParam === 'medsos' ? 'MEDSOS' : 'SEMUA';

  const [report, aired] = await Promise.all([
    getReportBundle(user, range),
    getAiredNews(user, range, kanal, 50),
  ]);

  // Parameter ekspor laporan (hanya CSV — Excel/PDF dihapus untuk mengurangi beban VPS)
  const exportParams: Record<string, string> = { range: range.preset };
  if (range.preset === 'custom') {
    exportParams.from = range.fromStr;
    exportParams.to = range.toStr;
  }

  const kpis = [
    { label: 'Total Kiriman', value: report.totals.total, icon: 'file', tone: 'var(--accent)' },
    { label: 'Disiarkan', value: report.totals.published, icon: 'broadcast', tone: 'var(--ok)' },
    { label: 'Tayang Onair', value: report.totals.onair, icon: 'broadcast', tone: 'var(--brand)' },
    { label: 'Tayang Medsos', value: report.totals.medsos, icon: 'external', tone: 'var(--accent)' },
    { label: 'Tayang Onair & Medsos', value: report.totals.airedBoth, icon: 'check', tone: 'var(--ok)' },
    { label: 'Menunggu Persetujuan', value: report.totals.pending, icon: 'clock', tone: 'var(--warn)' },
    { label: 'Didorong ke Pusat', value: report.totals.pushed, icon: 'push', tone: 'var(--brand)' },
    { label: 'Siaran Nasional', value: report.totals.national, icon: 'flame', tone: 'var(--brand)' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Laporan Pemberitaan</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Periode {range.preset === 'all' ? 'seluruh data' : `${range.fromStr} s/d ${range.toStr}`} ·{' '}
            {user.bureau ? user.bureau.name : 'Pusat'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_OPTIONS.filter((r) => r.key !== 'custom').map((r) => (
            <Link
              key={r.key}
              href={buildQuery('/dashboard/laporan', { range: r.key })}
              className={`btn btn-sm ${range.preset === r.key ? 'btn-accent' : ''}`}
            >
              {r.label}
            </Link>
          ))}
          <ExportButtons basePath="/api/export/report" params={exportParams} label="Ekspor laporan" />
        </div>
      </header>

      {/* Filter tanggal kustom */}
      <form action={p('/dashboard/laporan')} method="get" className="panel shadow-soft flex flex-wrap items-end gap-2 p-3">
        <input type="hidden" name="range" value="custom" />
        <div>
          <label className="label" htmlFor="lap-from">
            Dari tanggal
          </label>
          <input
            id="lap-from"
            type="date"
            name="from"
            defaultValue={range.preset === 'custom' ? range.fromStr : toDateInputValue(range.from)}
            className="input !w-[160px]"
          />
        </div>
        <div>
          <label className="label" htmlFor="lap-to">
            Sampai tanggal
          </label>
          <input
            id="lap-to"
            type="date"
            name="to"
            defaultValue={range.preset === 'custom' ? range.toStr : toDateInputValue(range.to)}
            className="input !w-[160px]"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          <Icon name="filter" size={13} /> Terapkan Periode
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="kpi">
            <div className="flex items-center justify-between">
              <span className="kpi-label">{k.label}</span>
              <span style={{ color: k.tone }}>
                <Icon name={k.icon} size={15} />
              </span>
            </div>
            <span className="kpi-value">{numberID(k.value)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="panel shadow-soft p-4">
          <h2 className="mb-3 text-[13.5px] font-bold">Tren Kiriman Harian</h2>
          <TrendChart data={report.trend} />
        </section>
        <section className="panel shadow-soft p-4">
          <h2 className="mb-3 text-[13.5px] font-bold">Komposisi Status</h2>
          <StatusChart data={report.byStatus} />
        </section>
        <section className="panel shadow-soft p-4">
          <h2 className="mb-3 text-[13.5px] font-bold">Berita per Kategori</h2>
          <CategoryChart data={report.byCategory} />
        </section>
        <section className="panel shadow-soft p-4">
          <h2 className="mb-3 text-[13.5px] font-bold">Produktivitas per Biro</h2>
          <BureauChart data={report.byBureau} />
        </section>
        <section className="panel shadow-soft p-4" data-chart="air-channel">
          <h2 className="mb-1 text-[13.5px] font-bold">Komposisi Kanal Tayang</h2>
          <p className="mb-2 text-[11.5px] text-muted">
            Onair {numberID(report.totals.onair)} · Medsos {numberID(report.totals.medsos)} · keduanya{' '}
            {numberID(report.totals.airedBoth)}
          </p>
          <AirChannelChart data={report.byAirChannel} />
        </section>
        <section className="panel shadow-soft p-4" data-chart="air-category">
          <h2 className="mb-3 text-[13.5px] font-bold">Tayang Onair &amp; Medsos per Kategori</h2>
          <AirByCategoryChart data={report.airByCategory} />
        </section>
      </div>

      {/* DAFTAR BERITA TAYANG (ONAIR / MEDSOS) */}
      <section className="panel shadow-soft overflow-hidden" data-table="aired-news">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <h2 className="text-[13.5px] font-bold">
            Berita Tayang
            <span className="ml-2 text-[12px] font-medium text-muted">
              {numberID(aired.length)} berita · {kanal === 'SEMUA' ? 'Onair + Medsos' : AIR_CHANNEL_LABELS[kanal]}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'SEMUA', label: 'Semua kanal' },
              { key: 'ONAIR', label: 'Tayang Onair' },
              { key: 'MEDSOS', label: 'Tayang Medsos' },
            ].map((f) => (
              <Link
                key={f.key}
                href={buildQuery('/dashboard/laporan', {
                  range: range.preset,
                  ...(range.preset === 'custom' ? { from: range.fromStr, to: range.toStr } : {}),
                  kanal: f.key === 'SEMUA' ? undefined : f.key.toLowerCase(),
                })}
                className={`btn btn-sm ${kanal === f.key ? 'btn-accent' : ''}`}
                data-kanal={f.key}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Judul Berita</th>
                <th style={{ width: 150 }}>Kategori</th>
                <th style={{ width: 170 }}>Sumber</th>
                <th style={{ width: 190 }}>Kanal Tayang</th>
              </tr>
            </thead>
            <tbody>
              {aired.map((n) => (
                <tr key={n.id}>
                  <td>
                    <Link
                      href={`/dashboard/tabulasi/berita/${n.id}`}
                      className="text-[12.5px] font-semibold hover:text-accent"
                    >
                      {n.kind === 'BREAKING' ? <span className="badge badge-danger mr-1.5 !py-0">BREAKING</span> : null}
                      {n.title}
                    </Link>
                    <span className="mono block text-[10.5px] text-muted">{n.code}</span>
                  </td>
                  <td className="text-[12px]">{n.category}</td>
                  <td className="text-[11.5px] text-muted">
                    {n.author.name}
                    {n.bureau ? ` · ${n.bureau.name}` : ' · Pusat'}
                  </td>
                  <td className="text-[11.5px]">
                    {n.airedOnair && n.airedOnairAt ? (
                      <span className="block" style={{ color: 'var(--brand)' }}>
                        <strong>ONAIR</strong> · {formatDateTimeID(n.airedOnairAt)}
                      </span>
                    ) : null}
                    {n.airedMedsos && n.airedMedsosAt ? (
                      <span className="block" style={{ color: 'var(--accent)' }}>
                        <strong>MEDSOS</strong> · {formatDateTimeID(n.airedMedsosAt)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!aired.length ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    Belum ada berita tayang {kanal === 'SEMUA' ? '' : `${AIR_CHANNEL_LABELS[kanal]} `}pada periode ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="panel shadow-soft overflow-hidden">
          <h2 className="border-b border-line px-3 py-2.5 text-[13.5px] font-bold">Rekap per Biro</h2>
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Biro / Unit</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Disiarkan</th>
                  <th className="text-right">Onair</th>
                  <th className="text-right">Medsos</th>
                  <th className="text-right">Menunggu</th>
                  <th className="text-right">Tayang %</th>
                </tr>
              </thead>
              <tbody>
                {report.byBureau.map((b) => (
                  <tr key={b.key}>
                    <td className="font-medium">{b.key}</td>
                    <td className="text-right mono">{b.value}</td>
                    <td className="text-right mono">{b.published}</td>
                    <td className="text-right mono" style={{ color: 'var(--brand)' }}>
                      {b.onair}
                    </td>
                    <td className="text-right mono" style={{ color: 'var(--accent)' }}>
                      {b.medsos}
                    </td>
                    <td className="text-right mono">{b.pending}</td>
                    <td className="text-right mono">{b.value ? Math.round((b.published / b.value) * 100) : 0}%</td>
                  </tr>
                ))}
                {!report.byBureau.length ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted">
                      Tidak ada data pada periode ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel shadow-soft overflow-hidden" data-table="air-category">
          <h2 className="border-b border-line px-3 py-2.5 text-[13.5px] font-bold">
            Rekap Tayang per Kategori
          </h2>
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th className="text-right">Tayang Onair</th>
                  <th className="text-right">Tayang Medsos</th>
                  <th className="text-right">Total Tayang</th>
                </tr>
              </thead>
              <tbody>
                {report.airByCategory.map((c) => (
                  <tr key={c.key}>
                    <td className="font-medium">{c.key}</td>
                    <td className="text-right mono" style={{ color: 'var(--brand)' }}>
                      {c.onair}
                    </td>
                    <td className="text-right mono" style={{ color: 'var(--accent)' }}>
                      {c.medsos}
                    </td>
                    <td className="text-right mono">{c.total}</td>
                  </tr>
                ))}
                {!report.airByCategory.length ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted">
                      Belum ada berita tayang pada periode ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel shadow-soft overflow-hidden">
          <h2 className="border-b border-line px-3 py-2.5 text-[13.5px] font-bold">Reporter Terproduktif (Top 10)</h2>
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Reporter</th>
                  <th>Biro</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Disiarkan</th>
                </tr>
              </thead>
              <tbody>
                {report.topReporters.map((r, i) => (
                  <tr key={r.name}>
                    <td className="font-medium">
                      <span className="mono mr-2 text-muted">{i + 1}</span>
                      {r.name}
                    </td>
                    <td className="text-[12px] text-muted">{r.bureau}</td>
                    <td className="text-right mono">{r.total}</td>
                    <td className="text-right mono">{r.published}</td>
                  </tr>
                ))}
                {!report.topReporters.length ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted">
                      Tidak ada data pada periode ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
