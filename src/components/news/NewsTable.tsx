import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { AIR_CHANNEL_BADGE, KIND_LABELS, STATUS_BADGE, STATUS_LABELS, ROLE_LABELS } from '@/lib/constants';
import { kindMeta } from '@/lib/news-kinds';
import { formatDateTimeID, parseTags } from '@/lib/utils';
import type { NewsListItem } from '@/lib/news';

export default function NewsTable({
  items,
  showBureau = true,
  emptyMessage = 'Tidak ada berita pada filter ini.',
}: {
  items: NewsListItem[];
  showBureau?: boolean;
  emptyMessage?: string;
}) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
        <Icon name="list" size={22} className="text-muted" />
        <p className="text-[13px] font-semibold">{emptyMessage}</p>
        <p className="max-w-sm text-[12px] text-muted">
          Coba ubah rentang tanggal atau filter, atau kirim berita baru melalui menu “Kirim Berita”.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="dtable">
        <thead>
          <tr>
            <th style={{ width: 118 }}>Status</th>
            <th>Judul &amp; Kategori</th>
            <th style={{ width: 190 }}>Sumber</th>
            <th style={{ width: 170 }}>Lokasi</th>
            <th style={{ width: 78 }} className="text-center">
              Media
            </th>
            <th style={{ width: 150 }}>Waktu Kirim</th>
            <th style={{ width: 74 }} />
          </tr>
        </thead>
        <tbody>
          {items.map((n) => {
            const tags = parseTags(n.tags);
            return (
              <tr key={n.id} className={n.kind !== 'REGULAR' ? 'border-l-2 border-l-[var(--brand)]' : ''}>
                <td>
                  <div className="flex flex-col gap-1">
                    <span className={STATUS_BADGE[n.status]}>{STATUS_LABELS[n.status]}</span>
                    <span className="mono text-muted">{n.code}</span>
                  </div>
                </td>
                <td>
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/dashboard/tabulasi/berita/${n.id}`}
                      className="text-[13.5px] font-semibold leading-snug hover:text-accent"
                    >
                      {n.kind !== 'REGULAR' ? (
                        <span className={`${kindMeta(n.kind).badge} mr-1.5 !py-0 align-middle`}>{kindMeta(n.kind).short}</span>
                      ) : null}
                      {n.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      <span className="badge badge-muted !py-0">{n.category}</span>
                      {n.originPool === 'DAERAH' && !n.isPushedToCenter ? (
                        <span className="badge badge-info !py-0">Pool Daerah</span>
                      ) : null}
                      {n.isPushedToCenter ? <span className="badge badge-warn !py-0">Didorong ke Pusat</span> : null}
                      {n.airedOnair ? <span className={`${AIR_CHANNEL_BADGE.ONAIR} !py-0`}>Onair</span> : null}
                      {n.airedMedsos ? <span className={`${AIR_CHANNEL_BADGE.MEDSOS} !py-0`}>Medsos</span> : null}
                      {n.isNational ? <span className="badge badge-brand !py-0">Siaran Nasional</span> : null}
                      {tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-muted">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </td>
                <td>
                  <p className="text-[12.5px] font-medium">{n.author.name}</p>
                  <p className="text-[11px] text-muted">
                    {ROLE_LABELS[n.authorRole]}
                    {showBureau && n.bureau ? ` · ${n.bureau.name}` : n.originPool === 'PUSAT' ? ' · Pusat' : ''}
                  </p>
                </td>
                <td>
                  <p className="flex items-start gap-1 text-[12px] leading-snug">
                    <Icon name="pin" size={12} className="mt-[3px] shrink-0 text-muted" />
                    <span className="line-clamp-2">{n.location || '-'}</span>
                  </p>
                  {n.latitude != null && n.longitude != null ? (
                    <p className="mono text-muted">
                      {n.latitude.toFixed(3)}, {n.longitude.toFixed(3)}
                    </p>
                  ) : (
                    <p className="text-[10.5px] text-muted">tanpa geo-tag</p>
                  )}
                </td>
                <td className="text-center">
                  <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                    <Icon name="video" size={12} />
                    {n._count.media}
                  </span>
                </td>
                <td>
                  <p className="text-[12px]">{formatDateTimeID(n.createdAt)}</p>
                  <p className="text-[10.5px] text-muted">{KIND_LABELS[n.kind]}</p>
                </td>
                <td className="text-right">
                  <Link href={`/dashboard/tabulasi/berita/${n.id}`} className="btn btn-sm">
                    <Icon name="eye" size={13} /> Buka
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
