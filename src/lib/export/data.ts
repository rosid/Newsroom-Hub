import type { ExportColumn, ExportSheet } from './builders';
import {
  KIND_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
} from '@/lib/constants';
import { formatDateShortID, formatDateTimeID, parseTags, numberID, type DateRange } from '@/lib/utils';
import type { NewsStats } from '@/lib/news';
import type { ReportBundle } from '@/lib/news';

/**
 * Penyusun baris & bagian ekspor (satu-satunya format: CSV) agar daftar kolom
 * hanya didefinisikan sekali di tempat ini.
 *
 * CATATAN KEPUTUSAN: format **xlsx** & **pdf** dihapus atas permintaan pemilik
 * aplikasi (mengurangi beban VPS — kedua format itu merakit berkas besar di memori
 * proses). Permintaan format lain otomatis dilayani sebagai CSV, bukan galat.
 */

export const EXPORT_FORMATS = ['csv'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const isExportFormat = (v: string | null | undefined): v is ExportFormat =>
  !!v && (EXPORT_FORMATS as readonly string[]).includes(v);

/** Kolom tabulasi berita (urutan & header dipakai ekspor CSV). */
export const NEWS_COLUMNS: ExportColumn[] = [
  { header: 'No', key: 'no' },
  { header: 'Nomor Berita', key: 'code' },
  { header: 'Judul', key: 'title' },
  { header: 'Kategori', key: 'category' },
  { header: 'Jenis', key: 'kind' },
  { header: 'Status', key: 'status' },
  { header: 'Pool', key: 'pool' },
  { header: 'Reporter', key: 'author' },
  { header: 'Biro', key: 'bureau' },
  { header: 'Lokasi', key: 'location' },
  { header: 'Provinsi', key: 'province' },
  { header: 'Geo-tag', key: 'geo' },
  { header: 'Lampiran', key: 'media' },
  { header: 'Dorong Pusat', key: 'pushed' },
  { header: 'Tayang Onair', key: 'airedOnair' },
  { header: 'Waktu Tayang Onair', key: 'airedOnairAt' },
  { header: 'Tayang Medsos', key: 'airedMedsos' },
  { header: 'Waktu Tayang Medsos', key: 'airedMedsosAt' },
  { header: 'Siaran Nasional', key: 'national' },
  { header: 'Tag', key: 'tags' },
  { header: 'Waktu Kirim', key: 'createdAt' },
  { header: 'Waktu Siar', key: 'publishedAt' },
];

export type NewsExportItem = {
  code: string;
  title: string;
  category: string;
  kind: string;
  status: string;
  originPool: string;
  author: { name: string; role: string };
  bureau: { name: string; code: string } | null;
  location: string;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  tags: string;
  isPushedToCenter: boolean;
  isNational: boolean;
  airedOnair?: boolean;
  airedMedsos?: boolean;
  airedOnairAt?: Date | null;
  airedMedsosAt?: Date | null;
  createdAt: Date;
  publishedAt: Date | null;
  _count: { media: number };
};

export function newsToRows(items: NewsExportItem[]): Record<string, string | number>[] {
  return items.map((n, i) => ({
    no: i + 1,
    code: n.code,
    title: n.title,
    category: n.category,
    kind: KIND_LABELS[n.kind as keyof typeof KIND_LABELS] ?? n.kind,
    status: STATUS_LABELS[n.status as keyof typeof STATUS_LABELS] ?? n.status,
    pool: n.originPool === 'DAERAH' ? (n.isPushedToCenter ? 'Daerah → Pusat' : 'Daerah') : 'Pusat',
    author: `${n.author.name} (${ROLE_LABELS[n.author.role as keyof typeof ROLE_LABELS] ?? n.author.role})`,
    bureau: n.bureau?.name ?? 'Pusat',
    location: [n.location, n.city].filter(Boolean).join(', '),
    province: n.province,
    geo: n.latitude != null && n.longitude != null ? `${n.latitude.toFixed(4)}, ${n.longitude.toFixed(4)}` : '-',
    media: n._count.media,
    pushed: n.isPushedToCenter ? 'Ya' : 'Tidak',
    airedOnair: n.airedOnair ? 'Ya' : 'Tidak',
    airedOnairAt: n.airedOnairAt ? formatDateTimeID(n.airedOnairAt) : '-',
    airedMedsos: n.airedMedsos ? 'Ya' : 'Tidak',
    airedMedsosAt: n.airedMedsosAt ? formatDateTimeID(n.airedMedsosAt) : '-',
    national: n.isNational ? 'Ya' : 'Tidak',
    tags: parseTags(n.tags).join(', '),
    createdAt: formatDateTimeID(n.createdAt),
    publishedAt: n.publishedAt ? formatDateTimeID(n.publishedAt) : '-',
  }));
}

/** Nama kolom CSV (urutan sama dengan NEWS_COLUMNS). */
export const newsCsvHeaders = () => NEWS_COLUMNS.map((c) => c.header);

export const newsToCsvRows = (items: NewsExportItem[]) => {
  const rows = newsToRows(items);
  return rows.map((r) => NEWS_COLUMNS.map((c) => r[c.key] ?? ''));
};

// ===================== LAPORAN =====================

export const REPORT_STATUS_COLUMNS: ExportColumn[] = [
  { header: 'Status', key: 'status' },
  { header: 'Jumlah', key: 'total' },
];

export const REPORT_CATEGORY_COLUMNS: ExportColumn[] = [
  { header: 'Kategori', key: 'category' },
  { header: 'Jumlah', key: 'total' },
];

export const REPORT_BUREAU_COLUMNS: ExportColumn[] = [
  { header: 'Biro / Unit', key: 'bureau' },
  { header: 'Total', key: 'total' },
  { header: 'Disiarkan', key: 'published' },
  { header: 'Tayang Onair', key: 'onair' },
  { header: 'Tayang Medsos', key: 'medsos' },
  { header: 'Menunggu', key: 'pending' },
  { header: 'Tayang %', key: 'rate' },
];

/** Rekap tayang per kategori (Onair vs Medsos). */
export const REPORT_AIR_CATEGORY_COLUMNS: ExportColumn[] = [
  { header: 'Kategori', key: 'category' },
  { header: 'Tayang Onair', key: 'onair' },
  { header: 'Tayang Medsos', key: 'medsos' },
  { header: 'Total Tayang', key: 'total' },
];

/** Komposisi kanal tayang. */
export const REPORT_AIR_CHANNEL_COLUMNS: ExportColumn[] = [
  { header: 'Kanal', key: 'channel' },
  { header: 'Jumlah Berita', key: 'total' },
];

/** Daftar berita tayang (per kanal & waktu tayang). */
export const REPORT_AIRED_COLUMNS: ExportColumn[] = [
  { header: 'Nomor Berita', key: 'code' },
  { header: 'Judul', key: 'title' },
  { header: 'Kategori', key: 'category' },
  { header: 'Reporter', key: 'author' },
  { header: 'Biro', key: 'bureau' },
  { header: 'Tayang Onair', key: 'airedOnair' },
  { header: 'Waktu Onair', key: 'airedOnairAt' },
  { header: 'Tayang Medsos', key: 'airedMedsos' },
  { header: 'Waktu Medsos', key: 'airedMedsosAt' },
];

export const REPORT_REPORTER_COLUMNS: ExportColumn[] = [
  { header: 'No', key: 'no' },
  { header: 'Reporter', key: 'name' },
  { header: 'Biro', key: 'bureau' },
  { header: 'Total', key: 'total' },
  { header: 'Disiarkan', key: 'published' },
];

export const REPORT_TREND_COLUMNS: ExportColumn[] = [
  { header: 'Tanggal', key: 'date' },
  { header: 'Total Kiriman', key: 'total' },
  { header: 'Disiarkan', key: 'published' },
];

export type ReportExportPayload = {
  summaryItems: { label: string; value: string }[];
  /** Blok rekap untuk CSV laporan (Ringkasan ditulis terpisah dari summaryItems). */
  sheets: ExportSheet[];
};

export function buildReportExport(
  report: ReportBundle,
  stats: NewsStats,
  range: DateRange,
  actor: { name: string; scope: string }
): ReportExportPayload {
  const summaryItems = [
    { label: 'Periode laporan', value: range.preset === 'all' ? 'Seluruh data' : `${range.fromStr} s/d ${range.toStr}` },
    { label: 'Cakupan data', value: actor.scope },
    { label: 'Total kiriman', value: numberID(report.totals.total) },
    { label: 'Disiarkan', value: numberID(report.totals.published) },
    { label: 'Menunggu persetujuan', value: numberID(report.totals.pending) },
    { label: 'Tayang ONAIR (TV)', value: numberID(report.totals.onair) },
    { label: 'Tayang MEDSOS', value: numberID(report.totals.medsos) },
    { label: 'Tayang ONAIR & MEDSOS', value: numberID(report.totals.airedBoth) },
    { label: 'Didorong ke pusat', value: numberID(report.totals.pushed) },
    { label: 'Siaran nasional', value: numberID(report.totals.national) },
    { label: 'Berita hari ini (semua periode)', value: numberID(stats.totalToday) },
    { label: 'Breaking news aktif', value: numberID(stats.breaking) },
    { label: 'Dibuat oleh', value: actor.name },
  ];

  const statusRows = report.byStatus.map((s) => ({ status: s.label, total: s.value }));
  const categoryRows = report.byCategory.map((c) => ({ category: c.key, total: c.value }));
  const bureauRows = report.byBureau.map((b) => ({
    bureau: b.key,
    total: b.value,
    published: b.published,
    onair: b.onair,
    medsos: b.medsos,
    pending: b.pending,
    rate: `${b.value ? Math.round((b.published / b.value) * 100) : 0}%`,
  }));
  const airChannelRows = report.byAirChannel.map((c) => ({ channel: c.label, total: c.value }));
  const airCategoryRows = report.airByCategory.map((c) => ({
    category: c.key,
    onair: c.onair,
    medsos: c.medsos,
    total: c.total,
  }));
  const reporterRows = report.topReporters.map((r, i) => ({
    no: i + 1,
    name: r.name,
    bureau: r.bureau,
    total: r.total,
    published: r.published,
  }));
  const trendRows = report.trend.map((t) => ({
    date: formatDateShortID(new Date(`${t.date}T00:00:00`)),
    total: t.total,
    published: t.published,
  }));

  const sheets: ExportSheet[] = [
    { name: 'Ringkasan', title: 'Ringkasan Laporan', columns: [{ header: 'Keterangan', key: 'label' }, { header: 'Nilai', key: 'value' }], rows: summaryItems },
    { name: 'Kanal Tayang', title: 'Komposisi Kanal Tayang', columns: REPORT_AIR_CHANNEL_COLUMNS, rows: airChannelRows },
    { name: 'Tayang per Kategori', title: 'Rekap Tayang per Kategori', columns: REPORT_AIR_CATEGORY_COLUMNS, rows: airCategoryRows },
    { name: 'Status', title: 'Jumlah per Status', columns: REPORT_STATUS_COLUMNS, rows: statusRows },
    { name: 'Kategori', title: 'Jumlah per Kategori', columns: REPORT_CATEGORY_COLUMNS, rows: categoryRows },
    { name: 'Per Biro', title: 'Produktivitas per Biro', columns: REPORT_BUREAU_COLUMNS, rows: bureauRows },
    { name: 'Reporter', title: 'Reporter Terproduktif (Top 10)', columns: REPORT_REPORTER_COLUMNS, rows: reporterRows },
    { name: 'Tren Harian', title: 'Tren Kiriman Harian', columns: REPORT_TREND_COLUMNS, rows: trendRows },
  ];

  return { summaryItems, sheets };
}

/** Ringkasan singkat tabulasi untuk baris pertama berkas CSV. */
export function newsCsvSummary(items: NewsExportItem[], label: string): string[][] {
  const breaking = items.filter((n) => n.kind === 'BREAKING').length;
  const national = items.filter((n) => n.isNational).length;
  return [
    ['Tabulasi', label],
    ['Jumlah berita', numberID(items.length)],
    ['Breaking news', numberID(breaking)],
    ['Siaran nasional', numberID(national)],
  ];
}

/** Ringkasan singkat laporan untuk baris pertama berkas CSV laporan. */
export function reportCsvSummary(items: { label: string; value: string }[]): string[][] {
  return items.map((i) => [i.label, i.value]);
}
