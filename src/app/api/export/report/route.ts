import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAiredNews, getReportBundle, getStats } from '@/lib/news';
import { canViewAllPools } from '@/lib/permissions';
import { buildReportExport, REPORT_AIRED_COLUMNS, reportCsvSummary } from '@/lib/export/data';
import { formatDateTimeID, parseDateRange } from '@/lib/utils';
import { buildCsv } from '@/lib/export/builders';
import { logAudit } from '@/lib/audit';
import { ROLE_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export const runtime = 'nodejs';

/**
 * Ekspor laporan pemberitaan — hanya CSV.
 * CATATAN KEPUTUSAN: format PDF & Excel (.xlsx) dihapus atas permintaan pemilik aplikasi
 * untuk mengurangi beban VPS. Format tidak dikenal tetap dilayani sebagai CSV.
 */

function fileBase() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `laporan-${ymd}`;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const range = parseDateRange({
    range: url.searchParams.get('range') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });

  const kanalParam = url.searchParams.get('kanal');
  const kanal: 'ONAIR' | 'MEDSOS' | 'SEMUA' =
    kanalParam === 'onair' ? 'ONAIR' : kanalParam === 'medsos' ? 'MEDSOS' : 'SEMUA';

  const [report, stats, aired] = await Promise.all([
    getReportBundle(user, range),
    getStats(user),
    getAiredNews(user, range, kanal, 1000),
  ]);
  const scope = canViewAllPools(user)
    ? 'Seluruh pool (pusat & biro daerah)'
    : user.bureau
      ? `${user.bureau.name} + Pool Pusat`
      : 'Pool Pusat';
  const periodLabel = range.preset === 'all' ? 'Seluruh data' : `${range.fromStr} s/d ${range.toStr}`;
  const payload = buildReportExport(report, stats, range, {
    name: `${user.name} (${ROLE_LABELS[user.role]})`,
    scope,
  });

  const airedRows: Record<string, string | number>[] = aired.map((n) => ({
    code: n.code,
    title: n.title,
    category: n.category,
    author: n.author.name,
    bureau: n.bureau?.name ?? 'Pusat',
    airedOnair: n.airedOnair ? 'Ya' : 'Tidak',
    airedOnairAt: n.airedOnairAt ? formatDateTimeID(n.airedOnairAt) : '-',
    airedMedsos: n.airedMedsos ? 'Ya' : 'Tidak',
    airedMedsosAt: n.airedMedsosAt ? formatDateTimeID(n.airedMedsosAt) : '-',
  }));

  // Blok tambahan: daftar berita tayang sesuai filter kanal
  const airedSheet = {
    name: 'Berita Tayang',
    title: kanal === 'SEMUA' ? 'Berita Tayang (Onair + Medsos)' : `Berita Tayang ${kanal}`,
    columns: REPORT_AIRED_COLUMNS,
    rows: airedRows,
  };

  await logAudit({
    actor: user,
    action: 'EXPORT_REPORT_CSV',
    entity: 'Report',
    meta: { rows: report.totals.total, range: range.preset },
  });

  // ---------- CSV (satu-satunya format) ----------
  // Ringkasan laporan + keterangan periode, lalu tiap rekap sebagai satu tabel (dipisah baris kosong).
  const blocks: string[] = [
    buildCsv(['Ringkasan Laporan', 'Nilai'], reportCsvSummary(payload.summaryItems)),
    buildCsv(
      ['Keterangan', 'Nilai'],
      [
        ['Periode', periodLabel],
        ['Cakupan', scope],
        ['Kanal berita tayang', kanal === 'SEMUA' ? 'Onair + Medsos' : kanal],
      ]
    ),
  ];
  for (const sheet of [...payload.sheets.filter((s) => s.name !== 'Ringkasan'), airedSheet]) {
    blocks.push('');
    blocks.push(buildCsv(sheet.columns.map((c) => c.header), sheet.rows.map((r) => sheet.columns.map((c) => r[c.key] ?? ''))));
  }

  return new NextResponse(`\uFEFF${blocks.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileBase()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
