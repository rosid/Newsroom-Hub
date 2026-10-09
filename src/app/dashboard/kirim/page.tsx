import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import NewsForm from '@/components/forms/NewsForm';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kirim Berita' };

export default async function KirimBeritaPage() {
  const user = await requireUser();
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { name: true, color: true },
  });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
            {user.bureau ? user.bureau.name : 'Reporter Pusat'}
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">Kirim Berita</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Lengkapi naskah, footage/gambar, lokasi, dan geo-tagging. Berita akan masuk ke{' '}
            <span className="font-semibold text-ink">
              {user.bureau ? 'Tabulasi Daerah biro Anda' : 'Tabulasi Pusat'}
            </span>{' '}
            setelah dikirim.
          </p>
        </div>
        <Link href="/dashboard/tabulasi?tab=saya" className="btn btn-sm">
          <Icon name="list" size={13} /> Kiriman Saya
        </Link>
      </header>

      <NewsForm categories={categories} />
    </div>
  );
}
