import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import {
  canAirNews,
  canDeleteNews,
  canEditNews,
  canPublish,
  canPushToCenter,
  canReview,
  canViewNews,
  isAdmin,
} from '@/lib/permissions';
import {
  AIR_CHANNEL_BADGE,
  AIR_CHANNEL_LABELS,
  KIND_LABELS,
  ROLE_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
} from '@/lib/constants';
import { kindMeta } from '@/lib/news-kinds';
import { formatDateTimeID, formatBytes, parseTags, timeAgo } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize';
import { mediaSrc } from '@/lib/storage';
import NewsActions from '@/components/news/NewsActions';
import { ShareNewsPanel, AssetActions } from '@/components/news/ShareMediaPanel';
import MapCanvas from '@/components/map/MapCanvas';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';

export default async function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const news = await prisma.news.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, email: true, role: true, jobTitle: true } },
      bureau: { select: { id: true, name: true, code: true, region: true } },
      media: { orderBy: { createdAt: 'asc' } },
      logs: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!news) notFound();
  if (!canViewNews(user, news)) {
    return (
      <div className="panel shadow-soft mx-auto max-w-lg p-6 text-center">
        <Icon name="lock" size={22} className="mx-auto text-muted" />
        <h1 className="mt-2 text-[16px] font-bold">Akses ditolak</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Berita ini berada di pool tabulasi yang tidak termasuk cakupan akses Anda. Produser pusat hanya melihat pool
          pusat &amp; berita daerah yang didorong ke pusat.
        </p>
        <Link href="/dashboard/tabulasi" className="btn btn-primary mt-4">
          Kembali ke Tabulasi
        </Link>
      </div>
    );
  }

  const tags = parseTags(news.tags);
  const html = sanitizeHtml(news.script);
  const photos = news.media.filter((m) => m.mimeType.startsWith('image/'));
  const videos = news.media.filter((m) => m.mimeType.startsWith('video/'));
  const docs = news.media.filter((m) => !m.mimeType.startsWith('image/') && !m.mimeType.startsWith('video/'));

  const point =
    news.latitude != null && news.longitude != null
      ? [
          {
            id: news.id,
            code: news.code,
            title: news.title,
            category: news.category,
            kind: news.kind,
            status: news.status,
            lat: news.latitude,
            lng: news.longitude,
            location: news.location,
            authorName: news.author.name,
            bureauName: news.bureau?.name ?? null,
            isNational: news.isNational,
            isPushedToCenter: news.isPushedToCenter,
            createdAt: news.createdAt.toISOString(),
          },
        ]
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <Link href="/dashboard/tabulasi" className="inline-flex items-center gap-1 hover:text-accent">
          <Icon name="back" size={13} /> Tabulasi Berita
        </Link>
        <span>/</span>
        <span className="mono">{news.code}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          <article className="panel shadow-soft p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={STATUS_BADGE[news.status]}>{STATUS_LABELS[news.status]}</span>
              {news.kind !== 'REGULAR' ? (
                <span className={kindMeta(news.kind).badge}>{kindMeta(news.kind).label.toUpperCase()}</span>
              ) : null}
              <span className="badge badge-muted">{news.category}</span>
              {news.originPool === 'DAERAH' ? <span className="badge badge-info">Pool Daerah</span> : <span className="badge badge-muted">Pool Pusat</span>}
              {news.isPushedToCenter ? <span className="badge badge-warn">Didorong ke Pusat</span> : null}
              {news.airedOnair ? (
                <span className={AIR_CHANNEL_BADGE.ONAIR}>{AIR_CHANNEL_LABELS.ONAIR}</span>
              ) : null}
              {news.airedMedsos ? (
                <span className={AIR_CHANNEL_BADGE.MEDSOS}>{AIR_CHANNEL_LABELS.MEDSOS}</span>
              ) : null}
              {news.isNational ? <span className="badge badge-brand">Siaran Nasional</span> : null}
            </div>

            <h1 className="mt-3 text-[21px] font-extrabold leading-tight tracking-tight">{news.title}</h1>

            {news.summary ? <p className="mt-2 text-[13px] text-inksoft">{news.summary}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[11.5px] text-muted">
              <span className="font-semibold text-ink">{news.author.name}</span>
              <span>{ROLE_LABELS[news.authorRole]}</span>
              {news.bureau ? <span>· {news.bureau.name} ({news.bureau.code})</span> : <span>· Pusat</span>}
              <span>· Dikirim {formatDateTimeID(news.createdAt)}</span>
              <span>· {timeAgo(news.createdAt)}</span>
            </div>
          </article>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 text-[14px] font-bold">Naskah Berita</h2>
            <div className="prose-news text-[13.5px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          </section>

          <section className="panel shadow-soft p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-bold">
                Footage &amp; Gambar
                <span className="ml-2 text-[11.5px] font-medium text-muted">{news.media.length} lampiran</span>
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <ShareNewsPanel newsId={news.id} assetCount={news.media.length} />
              </div>
            </div>

            {news.media.length ? (
              <div className="flex flex-col gap-4">
                {videos.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {videos.map((m) => (
                      <figure key={m.id} className="panel-soft overflow-hidden">
                        <video controls preload="metadata" src={mediaSrc(m)} className="h-44 w-full bg-black object-contain" />
                        <figcaption className="flex flex-col gap-2 px-2.5 py-2">
                          <span className="flex items-center justify-between gap-2 text-[11px] text-muted">
                            <span className="truncate">{m.filename}</span>
                            <span className="shrink-0">{formatBytes(m.size)}</span>
                          </span>
                          <AssetActions
                            newsId={news.id}
                            asset={{
                              id: m.id,
                              filename: m.filename,
                              storageKey: m.storageKey,
                              mimeType: m.mimeType,
                              size: m.size,
                            }}
                          />
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}

                {photos.length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {photos.map((m) => (
                      <figure key={m.id} className="panel-soft overflow-hidden">
                        <a href={mediaSrc(m)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mediaSrc(m)} alt={m.filename} className="h-32 w-full object-cover" />
                        </a>
                        <figcaption className="flex flex-col gap-1.5 px-2 py-2">
                          <span className="truncate text-[10.5px] text-muted" title={m.filename}>
                            {m.filename} · {formatBytes(m.size)}
                          </span>
                          <AssetActions
                            newsId={news.id}
                            compact
                            asset={{
                              id: m.id,
                              filename: m.filename,
                              storageKey: m.storageKey,
                              mimeType: m.mimeType,
                              size: m.size,
                            }}
                          />
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}

                {docs.length ? (
                  <ul className="flex flex-col gap-2">
                    {docs.map((m) => (
                      <li key={m.id} className="panel-soft flex flex-wrap items-center gap-3 p-2">
                        <Icon name="file" size={15} className="text-muted" />
                        <a href={mediaSrc(m)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[12.5px] font-semibold hover:text-accent">
                          {m.filename}
                        </a>
                        <span className="text-[11px] text-muted">{formatBytes(m.size)}</span>
                        <AssetActions
                          newsId={news.id}
                          compact
                          asset={{
                            id: m.id,
                            filename: m.filename,
                            storageKey: m.storageKey,
                            mimeType: m.mimeType,
                            size: m.size,
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted">Tidak ada lampiran pada berita ini.</p>
            )}
          </section>
        </div>

        {/* Sisi kanan */}
        <div className="flex flex-col gap-4">
          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 text-[14px] font-bold">Tindakan</h2>
            <NewsActions
              newsId={news.id}
              status={news.status}
              isPushed={news.isPushedToCenter}
              isNational={news.isNational}
              canEdit={canEditNews(user, news)}
              canReview={canReview(user, news) && (news.status === 'PENDING' || news.status === 'REVISION')}
              canPush={canPushToCenter(user, news) && (news.status === 'VERIFIED' || news.status === 'PUBLISHED')}
              canRetractPush={
                news.isPushedToCenter &&
                (isAdmin(user) ||
                  user.role === 'REDAKTUR' ||
                  (user.role === 'PRODUSER_DAERAH' && news.authorBureauId === user.bureauId))
              }
              airedOnair={news.airedOnair}
              airedMedsos={news.airedMedsos}
              canAirOnair={!news.airedOnair && canAirNews(user, news)}
              canAirMedsos={!news.airedMedsos && canAirNews(user, news)}
              canUnpublish={(news.airedOnair || news.airedMedsos) && canPublish(user, { ...news, status: 'VERIFIED' })}
              canDelete={canDeleteNews(user, news)}
            />
            {news.status === 'PENDING' && canReview(user, news) ? (
              <p className="hint mt-2">
                Berita menunggu validasi Anda. Verifikasi agar masuk tabulasi pool dan dapat disiarkan.
              </p>
            ) : null}
          </section>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 text-[14px] font-bold">Detail</h2>
            <dl className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Nomor berita</dt>
                <dd className="mono">{news.code}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Jenis</dt>
                <dd>{KIND_LABELS[news.kind]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Kategori</dt>
                <dd>{news.category}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Lokasi</dt>
                <dd className="text-right">{news.location || '-'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Wilayah</dt>
                <dd className="text-right">{[news.city, news.province].filter(Boolean).join(', ') || '-'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Geo-tag</dt>
                <dd className="mono text-right">
                  {news.latitude != null && news.longitude != null
                    ? `${news.latitude.toFixed(5)}, ${news.longitude.toFixed(5)}`
                    : 'tidak ada'}
                </dd>
              </div>
              {news.tags ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Tag</dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {tags.map((t) => (
                      <span key={t} className="badge badge-muted">
                        #{t}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Tayang ONAIR</dt>
                <dd>
                  {news.airedOnairAt ? (
                    <span className="text-[color:var(--ok)]">{formatDateTimeID(news.airedOnairAt)}</span>
                  ) : (
                    <span className="text-muted">belum tayang</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Tayang MEDSOS</dt>
                <dd>
                  {news.airedMedsosAt ? (
                    <span className="text-[color:var(--ok)]">{formatDateTimeID(news.airedMedsosAt)}</span>
                  ) : (
                    <span className="text-muted">belum tayang</span>
                  )}
                </dd>
              </div>
              {news.reviewerNote ? (
                <div className="rounded-lg border border-line bg-panel2 p-2.5">
                  <dt className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Catatan Produser</dt>
                  <dd>{news.reviewerNote}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {point.length ? (
            <section className="panel shadow-soft p-4">
              <h2 className="mb-2 text-[14px] font-bold">Peta Lokasi</h2>
              <MapCanvas points={point} height={210} />
            </section>
          ) : null}

          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 text-[14px] font-bold">Riwayat Proses</h2>
            <ol className="flex flex-col gap-3">
              <li className="flex gap-2.5">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />
                <span>
                  <span className="block text-[12.5px] font-semibold">Berita dibuat</span>
                  <span className="block text-[11px] text-muted">
                    {news.author.name} · {formatDateTimeID(news.createdAt)}
                  </span>
                </span>
              </li>
              {news.logs.map((l) => (
                <li key={l.id} className="flex gap-2.5">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: l.toStatus === 'PUBLISHED' ? 'var(--ok)' : l.toStatus === 'REJECTED' ? 'var(--danger)' : 'var(--muted)' }}
                  />
                  <span>
                    <span className="block text-[12.5px] font-semibold">{STATUS_LABELS[l.toStatus]}</span>
                    <span className="block text-[11px] text-muted">
                      {l.actorName} · {formatDateTimeID(l.createdAt)}
                    </span>
                    {l.note ? <span className="mt-0.5 block text-[11.5px] text-inksoft">{l.note}</span> : null}
                  </span>
                </li>
              ))}
              {news.pushedAt ? (
                <li className="flex gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--warn)' }} />
                  <span>
                    <span className="block text-[12.5px] font-semibold">Didorong ke Pool Pusat</span>
                    <span className="block text-[11px] text-muted">{formatDateTimeID(news.pushedAt)}</span>
                  </span>
                </li>
              ) : null}
              {news.airedOnairAt ? (
                <li className="flex gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--brand)' }} />
                  <span>
                    <span className="block text-[12.5px] font-semibold">
                      Tayang ONAIR{news.isNational ? ' (siaran nasional)' : ''}
                    </span>
                    <span className="block text-[11px] text-muted">{formatDateTimeID(news.airedOnairAt)}</span>
                  </span>
                </li>
              ) : null}
              {news.airedMedsosAt ? (
                <li className="flex gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />
                  <span>
                    <span className="block text-[12.5px] font-semibold">Tayang MEDSOS</span>
                    <span className="block text-[11px] text-muted">{formatDateTimeID(news.airedMedsosAt)}</span>
                  </span>
                </li>
              ) : null}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
