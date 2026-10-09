import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { RANGE_OPTIONS, buildQuery } from '@/lib/utils';
import { p } from '@/lib/base';
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/constants';
import type { PoolTab } from '@/lib/permissions';

export type FilterOption = { value: string; label: string };

export default function FilterBar({
  tabs,
  activeTab,
  categories,
  provinces,
  bureaus,
  showBureau,
  params,
}: {
  tabs: PoolTab[];
  activeTab: string;
  categories: FilterOption[];
  provinces: FilterOption[];
  bureaus: FilterOption[];
  showBureau: boolean;
  params: Record<string, string | undefined>;
}) {
  const base = '/dashboard/tabulasi';
  // form action HTML TIDAK mendapat basePath otomatis -> wajib p()
  const actionUrl = p(base);
  const keep = { ...params, page: undefined } as Record<string, string | undefined>;

  return (
    <div className="panel shadow-soft">
      {/* Tab pool */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2.5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={buildQuery(base, { ...keep, tab: t.key })}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
          >
            {t.label}
          </Link>
        ))}
        <span className="ml-auto hidden text-[11px] text-muted sm:block">
          Filter aktif: {params.range ? RANGE_OPTIONS.find((r) => r.key === params.range)?.label : '30 Hari'}
        </span>
      </div>

      {/* Rentang tanggal */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          <Icon name="clock" size={13} /> Tanggal
        </span>
        {RANGE_OPTIONS.filter((r) => r.key !== 'custom').map((r) => (
          <Link
            key={r.key}
            href={buildQuery(base, { ...keep, range: r.key, from: undefined, to: undefined })}
            className={`btn btn-sm ${(params.range ?? '30d') === r.key ? 'btn-accent' : ''}`}
          >
            {r.label}
          </Link>
        ))}
        <form
          action={actionUrl}
          method="get"
          className="flex flex-wrap items-center gap-1.5 md:ml-auto"
        >
          {Object.entries(keep).map(([k, v]) =>
            k === 'range' || k === 'from' || k === 'to' || v === undefined ? null : (
              <input key={k} type="hidden" name={k} value={v} />
            )
          )}
          <input type="hidden" name="range" value="custom" />
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ''}
            className="input !w-[150px] !py-1 !text-[12px]"
            aria-label="Tanggal mulai"
          />
          <span className="text-[12px] text-muted">s/d</span>
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ''}
            className="input !w-[150px] !py-1 !text-[12px]"
            aria-label="Tanggal akhir"
          />
          <button type="submit" className="btn btn-sm">
            <Icon name="filter" size={13} /> Terapkan
          </button>
        </form>
      </div>

      {/* Filter lain */}
      <form action={actionUrl} method="get" className="grid grid-cols-2 gap-2 px-3 py-2.5 md:grid-cols-12">
        <input type="hidden" name="tab" value={activeTab} />
        <input type="hidden" name="range" value={params.range ?? '30d'} />
        {params.view ? <input type="hidden" name="view" value={params.view} /> : null}
        {params.from ? <input type="hidden" name="from" value={params.from} /> : null}
        {params.to ? <input type="hidden" name="to" value={params.to} /> : null}

        <div className="col-span-2 md:col-span-4">
          <label className="label" htmlFor="f-q">
            Pencarian
          </label>
          <div className="relative">
            <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="f-q"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Judul, lokasi, nomor berita, isi naskah…"
              className="input !pl-8"
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="f-status">
            Status
          </label>
          <select id="f-status" name="status" defaultValue={params.status ?? ''} className="select">
            <option value="">Semua status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="f-cat">
            Kategori
          </label>
          <select id="f-cat" name="category" defaultValue={params.category ?? ''} className="select">
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="f-kind">
            Jenis
          </label>
          <select id="f-kind" name="kind" defaultValue={params.kind ?? ''} className="select">
            <option value="">Semua jenis</option>
            <option value="BREAKING">Breaking News</option>
            <option value="REGULAR">Berita Biasa</option>
          </select>
        </div>

        {showBureau ? (
          <div className="md:col-span-2">
            <label className="label" htmlFor="f-biro">
              Biro
            </label>
            <select id="f-biro" name="bureauId" defaultValue={params.bureauId ?? ''} className="select">
              <option value="">Semua biro</option>
              {bureaus.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="md:col-span-2">
          <label className="label" htmlFor="f-prov">
            Provinsi / Wilayah
          </label>
          <select id="f-prov" name="province" defaultValue={params.province ?? ''} className="select">
            <option value="">Semua wilayah</option>
            {provinces.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2 flex items-end gap-2 md:col-span-2">
          <button type="submit" className="btn btn-primary w-full">
            <Icon name="filter" size={13} /> Filter
          </button>
          <Link href={base} className="btn w-full">
            Reset
          </Link>
        </div>
      </form>
    </div>
  );
}

export const roleLabel = (r: string) => ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r;
