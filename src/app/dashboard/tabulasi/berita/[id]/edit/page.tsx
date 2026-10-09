import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { canEditNews } from '@/lib/permissions';
import { parseTags } from '@/lib/utils';
import { mediaSrc } from '@/lib/storage';
import NewsForm from '@/components/forms/NewsForm';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ubah Berita' };

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [news, categories] = await Promise.all([
    prisma.news.findUnique({ where: { id }, include: { media: { orderBy: { createdAt: 'asc' } } } }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { name: true, color: true },
    }),
  ]);

  if (!news) notFound();
  if (!canEditNews(user, news)) {
    return (
      <div className="panel shadow-soft mx-auto max-w-lg p-6 text-center">
        <Icon name="lock" size={22} className="mx-auto text-muted" />
        <h1 className="mt-2 text-[16px] font-bold">Tidak dapat diubah</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Berita yang sudah disiarkan atau bukan milik Anda tidak dapat diubah.
        </p>
        <Link href={`/dashboard/tabulasi/berita/${news.id}`} className="btn btn-primary mt-4">
          Lihat Berita
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="mono text-[11px] text-muted">{news.code}</p>
        <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">Ubah Berita</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Perbarui naskah/footage lalu kirim ulang ke produser bila sudah siap.
        </p>
      </header>

      <NewsForm
        categories={categories}
        isEdit
        initial={{
          id: news.id,
          title: news.title,
          script: news.script,
          summary: news.summary,
          category: news.category,
          kind: news.kind,
          location: news.location,
          province: news.province,
          city: news.city,
          latitude: news.latitude != null ? String(news.latitude) : '',
          longitude: news.longitude != null ? String(news.longitude) : '',
          tags: parseTags(news.tags),
          media: news.media.map((m) => ({
            storageKey: m.storageKey,
            url: mediaSrc(m),
            filename: m.filename,
            mimeType: m.mimeType,
            size: m.size,
            type: m.type,
          })),
        }}
      />
    </div>
  );
}
