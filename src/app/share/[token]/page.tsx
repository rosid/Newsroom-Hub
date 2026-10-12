import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getOrgSettings } from '@/lib/settings';
import { verifyShareToken, shareMediaPath, originalFilename } from '@/lib/share';
import { formatDateTimeID, formatDateShortID } from '@/lib/utils';
import { KIND_LABELS, ROLE_LABELS } from '@/lib/constants';
import { kindMeta } from '@/lib/news-kinds';
import ShareAssetList, { type SharedAsset } from '@/components/share/ShareAssetList';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Berbagi Materi Berita',
  robots: { index: false, follow: false },
};

/** Halaman publik untuk tamu (mis. video editor) — tanpa login. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scope = verifyShareToken(token);
  const org = await getOrgSettings();

  const header = (subtitle: string) => (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[14px] font-black text-white"
          style={{ background: 'var(--brand)' }}
        >
          G
        </span>
        <div>
          <p className="text-[14px] font-extrabold leading-tight">{org.siteName}</p>
          <p className="text-[11px] text-muted">{subtitle}</p>
        </div>
      </div>
      <Link href="/login" className="btn btn-sm">
        <Icon name="login" size={13} /> Masuk Newsroom
      </Link>
    </header>
  );

  if (!scope) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
        {header('Tautan berbagi materi')}
        <div className="panel p-6 text-center">
          <Icon name="lock" size={22} className="mx-auto text-muted" />
          <h1 className="mt-2 text-[16px] font-bold">Tautan tidak berlaku lagi</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Tautan berbagi ini tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru kepada pengirim dari
            redaksi GarudaTV.
          </p>
        </div>
      </main>
    );
  }

  const expiresAt = new Date(scope.exp * 1000);

  // ---------- Cakupan: satu berkas ----------
  if (scope.kind === 'media') {
    const asset = await prisma.mediaAsset.findFirst({
      where: { storageKey: scope.storageKey },
      include: {
        news: {
          include: { author: { select: { name: true } }, bureau: { select: { name: true, code: true } } },
        },
      },
    });

    if (!asset) {
      return (
        <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
          {header('Tautan berbagi materi')}
          <div className="panel p-6 text-center">
            <Icon name="alert" size={22} className="mx-auto text-muted" />
            <h1 className="mt-2 text-[16px] font-bold">Berkas sudah tidak tersedia</h1>
            <p className="mt-1 text-[12.5px] text-muted">
              Berkas ini kemungkinan sudah dihapus dari newsroom. Minta pengganti kepada pengirim dari redaksi.
            </p>
          </div>
        </main>
      );
    }

    const assets: SharedAsset[] = [
      {
        id: asset.id,
        filename: originalFilename(asset.storageKey, asset.filename),
        mimeType: asset.mimeType,
        size: asset.size,
        caption: asset.caption || undefined,
        viewPath: shareMediaPath(token, asset.storageKey),
        downloadPath: shareMediaPath(token, asset.storageKey, { download: true }),
      },
    ];

    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        {header('Tautan berbagi berkas (tamu)')}
        <section className="panel p-4">
          <span className="badge badge-accent">Akses Tamu</span>
          <h1 className="mt-2 text-[17px] font-extrabold leading-snug">
            {asset.news.kind !== 'REGULAR' ? (
              <span className={`${kindMeta(asset.news.kind).badge} mr-1.5 align-middle`}>{kindMeta(asset.news.kind).short}</span>
            ) : null}
            {asset.news.title}
          </h1>
          <p className="mt-1 text-[12px] text-muted">
            {asset.news.code} · {asset.news.category} · {KIND_LABELS[asset.news.kind]}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            {asset.news.author.name} ({ROLE_LABELS[asset.news.authorRole]})
            {asset.news.bureau ? ` · ${asset.news.bureau.name}` : ' · Pusat'}
            {asset.news.location ? ` · ${asset.news.location}` : ''}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted">
            <Icon name="clock" size={12} /> Tautan berlaku sampai {formatDateTimeID(expiresAt)}
          </p>
        </section>
        <ShareAssetList assets={assets} />
      </main>
    );
  }

  // ---------- Cakupan: seluruh lampiran satu berita ----------
  const news = await prisma.news.findUnique({
    where: { id: scope.newsId },
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      author: { select: { name: true } },
      bureau: { select: { name: true, code: true } },
    },
  });

  if (!news) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
        {header('Tautan berbagi materi')}
        <div className="panel p-6 text-center">
          <Icon name="alert" size={22} className="mx-auto text-muted" />
          <h1 className="mt-2 text-[16px] font-bold">Berita sudah tidak tersedia</h1>
          <p className="mt-1 text-[12.5px] text-muted">Materi ini kemungkinan sudah dihapus dari newsroom.</p>
        </div>
      </main>
    );
  }

  const assets: SharedAsset[] = news.media.map((m) => ({
    id: m.id,
    filename: originalFilename(m.storageKey, m.filename),
    mimeType: m.mimeType,
    size: m.size,
    caption: m.caption || undefined,
    viewPath: shareMediaPath(token, m.storageKey),
    downloadPath: shareMediaPath(token, m.storageKey, { download: true }),
  }));

  const videoCount = assets.filter((a) => a.mimeType.startsWith('video/')).length;
  const imageCount = assets.filter((a) => a.mimeType.startsWith('image/')).length;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
      {header('Tautan berbagi materi (tamu)')}

      <section className="panel p-4">
        <span className="badge badge-accent">Akses Tamu</span>
        <h1 className="mt-2 text-[17px] font-extrabold leading-snug">
          {news.kind !== 'REGULAR' ? (
            <span className={`${kindMeta(news.kind).badge} mr-1.5 align-middle`}>{kindMeta(news.kind).short}</span>
          ) : null}
          {news.title}
        </h1>
        <p className="mt-1 text-[12px] text-muted">
          {news.code} · {news.category} · {KIND_LABELS[news.kind]}
        </p>
        <p className="mt-1 text-[12px] text-muted">
          {news.author.name} ({ROLE_LABELS[news.authorRole]})
          {news.bureau ? ` · ${news.bureau.name}` : ' · Pusat'}
          {news.location ? ` · ${news.location}` : ''}
          {news.publishedAt ? ` · disiarkan ${formatDateShortID(news.publishedAt)}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="video" size={12} /> {videoCount} footage
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="image" size={12} /> {imageCount} gambar
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" size={12} /> berlaku sampai {formatDateTimeID(expiresAt)}
          </span>
        </div>
        {news.summary ? <p className="mt-3 text-[12.5px] text-inksoft">{news.summary}</p> : null}
      </section>

      <ShareAssetList assets={assets} />
    </main>
  );
}
