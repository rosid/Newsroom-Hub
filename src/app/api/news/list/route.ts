import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { allowedTabKeys, poolTabsFor } from '@/lib/permissions';
import {
  getTabulation,
  serializeNewsCard,
  spOne,
  tabulationFiltersFrom,
  TABULASI_PER_PAGE,
  type TabKey,
} from '@/lib/news';

export const dynamic = 'force-dynamic';

/**
 * Endpoint data tabulasi untuk "muat 20 kartu lagi" pada tampilan kartu.
 * Memakai aturan visibilitas pool yang sama dengan halaman tabulasi
 * (newsVisibilityWhere) — jadi pengguna tidak bisa memuat data di luar cakupannya.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const tabs = poolTabsFor(user);
  const allowed = allowedTabKeys(user) as string[];
  const requested = spOne(sp.tab);
  const tab: TabKey = (requested && allowed.includes(requested) ? requested : tabs[0].key) as TabKey;

  const filters = tabulationFiltersFrom(sp);
  const page = Math.max(1, Math.min(Number(spOne(sp.page) ?? 1) || 1, 1000));

  try {
    const data = await getTabulation(user, tab, filters, page, TABULASI_PER_PAGE);
    return NextResponse.json({
      ok: true,
      tab,
      page: data.page,
      pages: data.pages,
      perPage: data.perPage,
      total: data.total,
      hasMore: data.page < data.pages,
      items: data.items.map(serializeNewsCard),
    });
  } catch (e) {
    console.error('[api/news/list] gagal memuat data:', e);
    return NextResponse.json({ ok: false, error: 'Gagal memuat data berita.' }, { status: 500 });
  }
}
