import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { tabWhere, type TabKey } from '@/lib/news';
import { allowedTabKeys, canViewAllPools } from '@/lib/permissions';
import { newsCsvHeaders, newsCsvSummary, newsToCsvRows } from '@/lib/export/data';
import { buildCsv } from '@/lib/export/builders';
import { parseDateRange } from '@/lib/utils';
import { logAudit } from '@/lib/audit';
import { ROLE_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Ekspor tabulasi berita — hanya CSV.
 * CATATAN KEPUTUSAN: format PDF & Excel (.xlsx) dihapus atas permintaan pemilik aplikasi
 * untuk mengurangi beban VPS (keduanya merakit berkas besar di memori proses lewat
 * pdfkit/exceljs). Parameter `format` lain (mis. sisa tautan lama `?format=xlsx`)
 * tetap dilayani sebagai CSV, bukan galat.
 */

const TAB_LABELS: Record<string, string> = {
  pusat: 'Tabulasi Pusat',
  daerah: 'Tabulasi Daerah',
  saya: 'Kiriman Saya',
  pending: 'Menunggu Persetujuan',
  nasional: 'Siaran Nasional',
};

function fileBase(tab: TabKey) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `tabulasi-${tab}-${ymd}`;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const allowed = allowedTabKeys(user) as string[];
  const requestedTab = url.searchParams.get('tab') ?? allowed[0];
  const tab: TabKey = (allowed.includes(requestedTab) ? requestedTab : allowed[0]) as TabKey;

  const range = parseDateRange({
    range: url.searchParams.get('range') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });

  const items = await prisma.news.findMany({
    where: tabWhere(user, tab, {
      q: url.searchParams.get('q') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      category: url.searchParams.get('category') ?? undefined,
      kind: url.searchParams.get('kind') ?? undefined,
      province: url.searchParams.get('province') ?? undefined,
      bureauId: url.searchParams.get('bureauId') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      range,
    }),
    include: {
      author: { select: { name: true, role: true } },
      bureau: { select: { name: true, code: true } },
      _count: { select: { media: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  await logAudit({
    actor: user,
    action: 'EXPORT_NEWS_CSV',
    entity: 'News',
    meta: { tab, rows: items.length, range: range.preset },
  });

  const scope = canViewAllPools(user) ? 'Seluruh pool (pusat & biro daerah)' : user.bureau ? `${user.bureau.name} + Pool Pusat` : 'Pool Pusat';
  const periodLabel = range.preset === 'all' ? 'Seluruh data' : `${range.fromStr} s/d ${range.toStr}`;
  const tabLabel = TAB_LABELS[tab] ?? tab;

  // CSV menampung 3 blok: ringkasan tabulasi, keterangan periode, lalu tabel datanya.
  const blocks: string[] = [
    buildCsv(['Tabulasi', tabLabel], newsCsvSummary(items, tabLabel)),
    buildCsv(
      ['Keterangan', 'Nilai'],
      [
        ['Periode', periodLabel],
        ['Cakupan', scope],
        ['Dibuat oleh', `${user.name} (${ROLE_LABELS[user.role]})`],
      ]
    ),
  ];
  blocks.push('');
  blocks.push(buildCsv(newsCsvHeaders(), newsToCsvRows(items)));

  return new NextResponse(`\uFEFF${blocks.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileBase(tab)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
