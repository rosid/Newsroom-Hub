import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { canViewAllPools, poolTabsFor, type PoolTab } from '@/lib/permissions';
import {
  getFilterOptions,
  getStats,
  getTabulation,
  serializeNewsCard,
  spOne,
  tabulationFiltersFrom,
  tabulationQueryParams,
  TABULASI_PER_PAGE,
  type TabKey,
} from '@/lib/news';
import { buildQuery } from '@/lib/utils';
import StatsCards from '@/components/news/StatsCards';
import FilterBar from '@/components/news/FilterBar';
import NewsTable from '@/components/news/NewsTable';
import NewsCardGrid from '@/components/news/NewsCardGrid';
import ViewToggle, { type TabView } from '@/components/news/ViewToggle';
import ExportButtons from '@/components/ui/ExportButtons';
import Pagination from '@/components/ui/Pagination';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tabulasi Berita' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TabulasiPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;

  const tabs: PoolTab[] = poolTabsFor(user);
  const allowed: string[] = tabs.map((t) => t.key as string);
  const activeTab: TabKey = (allowed.includes(String(sp.tab)) ? String(sp.tab) : tabs[0].key) as TabKey;

  const filters = tabulationFiltersFrom(sp);
  const { range } = filters;
  const page = Math.max(1, Number(spOne(sp.page) ?? 1) || 1);
  const view: TabView = spOne(sp.view) === 'card' ? 'card' : 'list';

  const [stats, data, options] = await Promise.all([
    getStats(user),
    getTabulation(user, activeTab, filters, view === 'card' ? 1 : page, TABULASI_PER_PAGE),
    getFilterOptions(),
  ]);

  const queryParams = tabulationQueryParams(activeTab, filters, view);
  const showBureau = canViewAllPools(user) || !user.bureauId;
  const activeTabLabel = tabs.find((t) => t.key === activeTab)?.label ?? 'Tabulasi';

  // Parameter (tanpa `view`/`page`) untuk batch kartu berikutnya
  const cardQuery: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...queryParams, view: undefined, page: undefined })) {
    if (typeof v === 'string' && v !== '') cardQuery[k] = v;
  }

  // Parameter ekspor (tanpa format — dipilih lewat tombol CSV/Excel/PDF).
  // Tombol ekspor (hanya CSV) memakai <a href> biasa sehingga WAJIB lewat p() (lihat ExportButtons).
  const exportParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(queryParams)) {
    if (typeof v === 'string' && v !== '' && k !== 'view' && k !== 'page') exportParams[k] = v;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Tabulasi Berita</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {user.bureau ? (
              <>
                Cakupan akses: <span className="font-semibold text-ink">{user.bureau.name}</span> + Pool Pusat
              </>
            ) : (
              <>
                Cakupan akses:{' '}
                <span className="font-semibold text-ink">
                  {canViewAllPools(user) ? 'seluruh pool (pusat & biro daerah)' : 'Pool Pusat & siaran nasional'}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons basePath="/api/export/news" params={exportParams} />
          <Link href="/dashboard/kirim" className="btn btn-primary btn-sm">
            <Icon name="plus" size={14} /> Kirim Berita
          </Link>
        </div>
      </header>

      <StatsCards stats={stats} />

      <FilterBar
        tabs={tabs}
        activeTab={activeTab}
        categories={options.categories.map((c) => ({ value: c.name, label: c.name }))}
        provinces={options.provinces.map((pv) => ({ value: pv, label: pv }))}
        bureaus={options.bureaus.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
        showBureau={canViewAllPools(user)}
        params={queryParams}
      />

      <section className="panel shadow-soft overflow-hidden" id="tabulasi-berita">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[13.5px] font-bold">
              {activeTabLabel}
              <span className="ml-2 text-[12px] font-medium text-muted">{data.total} berita</span>
            </h2>
            <span className="hidden text-[11px] text-muted lg:inline">
              · {view === 'card' ? 'tampilan kartu (4 kolom)' : 'tampilan daftar'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-muted">
              {view === 'card'
                ? `20 kartu per muat`
                : `Halaman ${data.page} dari ${data.pages}`}{' '}
              · {range.preset === 'all' ? 'semua tanggal' : `${range.fromStr} s/d ${range.toStr}`}
            </p>
            <ViewToggle view={view} basePath="/dashboard/tabulasi" params={queryParams} />
          </div>
        </div>

        {view === 'card' ? (
          <NewsCardGrid
            key={JSON.stringify(cardQuery)}
            initialItems={data.items.map(serializeNewsCard)}
            initialPage={1}
            pages={data.pages}
            total={data.total}
            query={cardQuery}
            emptyMessage={`Belum ada berita pada ${activeTabLabel.toLowerCase()}.`}
            showBureau={showBureau}
            perPage={TABULASI_PER_PAGE}
          />
        ) : (
          <>
            <NewsTable
              items={data.items}
              showBureau={showBureau}
              emptyMessage={`Belum ada berita pada ${activeTabLabel.toLowerCase()}.`}
            />
            <Pagination
              page={data.page}
              pages={data.pages}
              basePath="/dashboard/tabulasi"
              params={queryParams}
              hash="#tabulasi-berita"
            />
          </>
        )}
      </section>

      <p className="text-[11.5px] text-muted">
        Butuh melihat sebaran lokasi? Buka{' '}
        <Link href={buildQuery('/dashboard/peta', { range: range.preset })} className="text-accent hover:underline">
          Peta Sebaran Berita
        </Link>
        .
      </p>
    </div>
  );
}
