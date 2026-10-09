'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { AIR_CHANNEL_BADGE, STATUS_BADGE, STATUS_LABELS, ROLE_LABELS } from '@/lib/constants';
import { BASE_PATH } from '@/lib/base';
import { formatDateTimeID, timeAgo } from '@/lib/utils';
import type { NewsCardData } from '@/lib/news';

type Props = {
  initialItems: NewsCardData[];
  initialPage: number;
  pages: number;
  total: number;
  /** Parameter filter (tanpa `page`) untuk permintaan batch berikutnya. */
  query: Record<string, string>;
  emptyMessage: string;
  showBureau: boolean;
  perPage: number;
};

/**
 * Tampilan kartu tabulasi: grid 4 kolom dengan paginasi "load more"
 * (20 kartu per batch, memuat dari /api/news/list dengan filter yang sama).
 */
export default function NewsCardGrid({
  initialItems,
  initialPage,
  pages,
  total,
  query,
  emptyMessage,
  showBureau,
  perPage,
}: Props) {
  const [items, setItems] = useState<NewsCardData[]>(initialItems);
  const [page, setPage] = useState(initialPage);
  const [pagesState, setPagesState] = useState(pages);
  const [totalState, setTotalState] = useState(total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasMore = page < pagesState;
  const queryString = useMemo(() => new URLSearchParams(query).toString(), [query]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(queryString);
      params.set('page', String(page + 1));
      const res = await fetch(`${BASE_PATH}/api/news/list?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...(data.items as NewsCardData[]).filter((i) => !seen.has(i.id))];
      });
      setPage(data.page as number);
      setPagesState(data.pages as number);
      setTotalState(data.total as number);
    } catch (e) {
      setError(`Gagal memuat kartu berikutnya: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, queryString]);

  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
        <Icon name="grid" size={22} className="text-muted" />
        <p className="text-[13px] font-semibold">{emptyMessage}</p>
        <p className="max-w-sm text-[12px] text-muted">
          Coba ubah rentang tanggal atau filter, atau kirim berita baru melalui menu “Kirim Berita”.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((n) => (
          <NewsCard key={n.id} news={n} showBureau={showBureau} />
        ))}
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={`sk-${i}`} className="panel animate-pulse overflow-hidden">
                <div className="aspect-video w-full bg-panel3" />
                <div className="flex flex-col gap-2 p-3">
                  <div className="h-3 w-20 rounded bg-panel3" />
                  <div className="h-4 w-full rounded bg-panel3" />
                  <div className="h-4 w-2/3 rounded bg-panel3" />
                </div>
              </div>
            ))
          : null}
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-line px-3 py-4">
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        <p className="text-[11.5px] text-muted">
          Menampilkan <span className="font-semibold text-ink">{items.length}</span> dari {totalState} kartu berita
        </p>

        {hasMore ? (
          <button type="button" className="btn btn-primary" onClick={() => void loadMore()} disabled={loading}>
            <Icon name="plus" size={14} />
            {loading ? 'Memuat…' : `Muat ${perPage} Kartu Lagi`}
          </button>
        ) : (
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            <Icon name="check" size={13} /> Semua berita pada filter ini sudah dimuat.
          </p>
        )}
      </div>
    </div>
  );
}

function NewsCard({ news: n, showBureau }: { news: NewsCardData; showBureau: boolean }) {
  const bureauLine = showBureau && n.bureauName ? n.bureauName : n.originPool === 'PUSAT' && !n.bureauName ? 'Pusat' : n.bureauName;

  return (
    <Link
      href={`/dashboard/tabulasi/berita/${n.id}`}
      className="panel group flex flex-col overflow-hidden transition hover:border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] hover:shadow-soft"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-panel3">
        {n.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={n.thumbUrl}
            alt={n.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              backgroundImage:
                'linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--brand) 14%, transparent))',
            }}
          >
            <Icon name={n.footageCount ? 'video' : 'file'} size={24} className="text-muted" />
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <span className={STATUS_BADGE[n.status]}>{STATUS_LABELS[n.status]}</span>
        </div>
        <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
          {n.kind === 'BREAKING' ? <span className="badge badge-danger">BREAKING</span> : null}
          {n.isNational ? <span className="badge badge-brand">Nasional</span> : null}
        </div>

        {n.mediaCount ? (
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-1 text-[10.5px] font-semibold text-white">
            {n.footageCount ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="video" size={11} /> {n.footageCount}
              </span>
            ) : null}
            {n.photoCount ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="image" size={11} /> {n.photoCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="badge badge-muted">{n.category}</span>
          {n.isPushedToCenter ? <span className="badge badge-warn">Dorong Pusat</span> : null}
          {n.airedOnair ? <span className={AIR_CHANNEL_BADGE.ONAIR}>Onair</span> : null}
          {n.airedMedsos ? <span className={AIR_CHANNEL_BADGE.MEDSOS}>Medsos</span> : null}
          {n.originPool === 'DAERAH' && !n.isPushedToCenter ? <span className="badge badge-info">Daerah</span> : null}
        </div>

        <h3 className="text-[13.5px] font-bold leading-snug tracking-tight group-hover:text-accent">
          <span className="line-clamp-2">{n.title}</span>
        </h3>

        {n.summary ? (
          <p className="text-[12px] leading-snug text-muted">
            <span className="line-clamp-2">{n.summary}</span>
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-1 border-t border-linesoft pt-2 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <Icon name="pin" size={11} className="shrink-0" />
            <span className="truncate">{n.location || [n.city, n.province].filter(Boolean).join(', ') || 'Lokasi belum diisi'}</span>
            {n.latitude != null && n.longitude != null ? (
              <span className="ml-auto shrink-0 text-accent" title="Sudah geo-tagging">
                <Icon name="map" size={11} />
              </span>
            ) : null}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate">
              <span className="font-semibold text-inksoft">{n.authorName}</span>
              <span> · {ROLE_LABELS[n.authorRole] ?? n.authorRole}</span>
            </span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate">{bureauLine ?? '-'}</span>
            <span className="shrink-0" title={formatDateTimeID(n.createdAt)}>
              {timeAgo(n.createdAt)}
            </span>
          </span>
          <span className="mono text-[10.5px] text-muted">{n.code}</span>
        </div>
      </div>
    </Link>
  );
}
