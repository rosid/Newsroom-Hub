/**
 * Uji unit penyusun data ekspor (tanpa browser/DB):
 * kolom, baris, format angka/tanggal, escaping CSV, dan pembuktian bahwa format
 * PDF/Excel SUDAH DIHAPUS (hanya CSV) — lihat catatan keputusan di src/lib/export/data.ts.
 *
 *   npx tsx scripts/export-unit.ts
 */
import {
  EXPORT_FORMATS,
  NEWS_COLUMNS,
  buildReportExport,
  newsCsvHeaders,
  newsCsvSummary,
  newsToCsvRows,
  newsToRows,
  reportCsvSummary,
  type NewsExportItem,
} from '../src/lib/export/data';
import * as buildersModule from '../src/lib/export/builders';
import * as dataModule from '../src/lib/export/data';
import { buildCsv } from '../src/lib/export/builders';
import { parseDateRange } from '../src/lib/utils';
import type { NewsStats, ReportBundle } from '../src/lib/news';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const news: NewsExportItem[] = [
  {
    code: 'NB-20261006-0001',
    title: 'Presiden Resmikan Tol Trans Sumatera',
    category: 'Pemerintahan',
    kind: 'BREAKING',
    status: 'PUBLISHED',
    originPool: 'DAERAH',
    author: { name: 'Fajar Simbolon', role: 'REPORTER_DAERAH' },
    bureau: { name: 'Biro Medan', code: 'MDN' },
    location: 'Medan',
    city: 'Medan',
    province: 'Sumatera Utara',
    latitude: 3.5952,
    longitude: 98.6722,
    tags: JSON.stringify(['tol', 'infrastruktur']),
    isPushedToCenter: true,
    isNational: true,
    airedOnair: true,
    airedMedsos: false,
    airedOnairAt: new Date('2026-10-06T05:00:00'),
    airedMedsosAt: null,
    createdAt: new Date('2026-10-06T02:30:00'),
    publishedAt: new Date('2026-10-06T05:00:00'),
    _count: { media: 2 },
  },
  {
    code: 'NB-20261006-0002',
    title: 'Tanpa Geo-tag',
    category: 'Ekonomi',
    kind: 'REGULAR',
    status: 'PENDING',
    originPool: 'PUSAT',
    author: { name: 'Yoga Pratama', role: 'REPORTER_PUSAT' },
    bureau: null,
    location: '',
    city: '',
    province: '',
    latitude: null,
    longitude: null,
    tags: '[]',
    isPushedToCenter: false,
    isNational: false,
    createdAt: new Date('2026-10-06T03:00:00'),
    publishedAt: null,
    _count: { media: 0 },
  },
];

const rows = newsToRows(news);
check('jumlah baris sesuai data', rows.length === 2);
check('nomor urut dimulai dari 1', rows[0].no === 1 && rows[1].no === 2);
check('label jenis diterjemahkan', rows[0].kind === 'Breaking News' && rows[1].kind === 'Berita Biasa', `${rows[0].kind} / ${rows[1].kind}`);
check('label status diterjemahkan', rows[0].status === 'Disiarkan' && rows[1].status === 'Menunggu Persetujuan', `${rows[0].status} / ${rows[1].status}`);
check('pool daerah yang didorong ditandai', rows[0].pool === 'Daerah → Pusat', String(rows[0].pool));
check('pool pusat tanpa biro tetap benar', rows[1].pool === 'Pusat' && rows[1].bureau === 'Pusat');
check('reporter menyertakan role', String(rows[0].author).includes('Fajar Simbolon') && String(rows[0].author).includes('Reporter Daerah'), String(rows[0].author));
check('geo-tag diformat 4 desimal', rows[0].geo === '3.5952, 98.6722', String(rows[0].geo));
check('berita tanpa koordinat diberi tanda "-"', rows[1].geo === '-', String(rows[1].geo));
check('berita tanpa lampiran = 0', rows[1].media === 0);
check('tanggal kirim terformat', String(rows[0].createdAt).includes('2026'), String(rows[0].createdAt));
check('berita belum disiarkan: waktu siar "-"', rows[1].publishedAt === '-');
check('berita tayang onair: kolom kanal berisi Ya + waktu', rows[0].airedOnair === 'Ya' && rows[0].airedMedsos === 'Tidak' && String(rows[0].airedOnairAt) !== '-', `${rows[0].airedOnair}/${rows[0].airedMedsos}`);
check('tag digabung dengan koma', rows[0].tags === 'tol, infrastruktur', String(rows[0].tags));
check('lokasi menggabungkan lokasi + kota', rows[0].location === 'Medan, Medan', String(rows[0].location));
check('semua kolom terisi di setiap baris (tanpa undefined)', rows.every((r) => NEWS_COLUMNS.every((c) => r[c.key] !== undefined)));
check(
  'kolom kanal tayang tersedia di ekspor berita',
  NEWS_COLUMNS.some((c) => c.key === 'airedOnair') &&
    NEWS_COLUMNS.some((c) => c.key === 'airedMedsos') &&
    NEWS_COLUMNS.some((c) => c.key === 'airedOnairAt'),
  NEWS_COLUMNS.filter((c) => c.key.startsWith('aired')).map((c) => c.key).join(', ')
);
check('berita belum tayang: kolom kanal berisi Tidak/-', rows[1].airedOnair === 'Tidak' && rows[1].airedOnairAt === '-', `${rows[1].airedOnair} / ${rows[1].airedOnairAt}`);
check('jumlah kolom CSV = jumlah kolom tabel', newsCsvHeaders().length === NEWS_COLUMNS.length);
check('baris CSV sepanjang header', newsToCsvRows(news).every((r) => r.length === NEWS_COLUMNS.length));

// CSV escaping
const csv = buildCsv(['Judul', 'Catatan'], [['Naskah "kutip"', 'a;b'], ['Baris\nbaru', 5]]);
check('CSV memakai pemisah ; dan kutip ganda di-escape', csv.includes('"Naskah ""kutip"""') && csv.includes('"a;b"'), csv.split('\r\n')[1]);
check('CSV menangani newline dalam sel', csv.includes('"Baris\nbaru"'));
check('CSV header sesuai', csv.startsWith('"Judul";"Catatan"'));

// Penghapusan format PDF & Excel (permintaan pemilik aplikasi: kurangi beban VPS)
check('hanya format CSV yang terdaftar', EXPORT_FORMATS.length === 1 && EXPORT_FORMATS[0] === 'csv', EXPORT_FORMATS.join(', '));
check(
  'modul builders tidak lagi mengekspor buildPdf/buildXlsx/pdfSafeText',
  !('buildPdf' in buildersModule) && !('buildXlsx' in buildersModule) && !('pdfSafeText' in buildersModule),
  Object.keys(buildersModule).join(', ')
);
check(
  'modul data tidak lagi mengekspor buildNewsPdfSections',
  !('buildNewsPdfSections' in dataModule),
  'bersih'
);
check(
  'ringkasan CSV tabulasi memuat jumlah berita & breaking',
  newsCsvSummary(news, 'Tabulasi Pusat').some(([l, v]) => l === 'Jumlah berita' && v === '2') &&
    newsCsvSummary(news, 'Tabulasi Pusat').some(([l]) => l === 'Breaking news'),
  newsCsvSummary(news, 'Tabulasi Pusat').map(([l, v]) => `${l}=${v}`).join(', ')
);

// Laporan
const report: ReportBundle = {
  byStatus: [
    { key: 'PUBLISHED', label: 'Disiarkan', value: 2 },
    { key: 'PENDING', label: 'Menunggu Persetujuan', value: 1 },
  ],
  byCategory: [{ key: 'Pemerintahan', value: 2 }, { key: 'Ekonomi', value: 1 }],
  byBureau: [{ key: 'Biro Medan', value: 2, published: 1, pending: 1, onair: 1, medsos: 0 }],
  byKind: [{ key: 'BREAKING', value: 1 }],
  byAirChannel: [
    { key: 'ONAIR', label: 'Tayang Onair saja', value: 1 },
    { key: 'MEDSOS', label: 'Tayang Medsos saja', value: 0 },
    { key: 'BOTH', label: 'Tayang Onair & Medsos', value: 1 },
    { key: 'BELUM', label: 'Belum tayang', value: 1 },
  ],
  airByCategory: [{ key: 'Pemerintahan', onair: 1, medsos: 1, total: 1 }],
  trend: [{ date: '2026-10-06', label: '6/10', total: 3, published: 2, onair: 1, medsos: 1 }],
  topReporters: [{ name: 'Fajar Simbolon', bureau: 'Biro Medan', total: 2, published: 1 }],
  totals: { total: 3, published: 2, pending: 1, pushed: 1, national: 1, onair: 2, medsos: 1, airedBoth: 1 },
};
const stats: NewsStats = { totalToday: 3, pending: 1, published: 2, breaking: 1, verified: 0, draft: 0 };
const payload = buildReportExport(report, stats, parseDateRange({ range: '30d' }), { name: 'Sari Puspita (Admin Redaksi)', scope: 'Seluruh pool' });
check('laporan: 8 blok rekap CSV (termasuk rekap kanal tayang)', payload.sheets.length === 8, payload.sheets.map((s) => s.name).join(', '));
check(
  'laporan: nama blok rekap sesuai',
  ['Ringkasan', 'Kanal Tayang', 'Tayang per Kategori', 'Status', 'Kategori', 'Per Biro', 'Reporter', 'Tren Harian'].every(
    (n) => payload.sheets.some((s) => s.name === n)
  )
);
check(
  'laporan: ringkasan memuat angka kanal tayang',
  ['Tayang ONAIR (TV)', 'Tayang MEDSOS', 'Tayang ONAIR & MEDSOS'].every((l) => payload.summaryItems.some((i) => i.label === l)),
  payload.summaryItems.filter((i) => /tayang/i.test(i.label)).map((i) => `${i.label}=${i.value}`).join(', ')
);
const kanalSheet = payload.sheets.find((s) => s.name === 'Kanal Tayang')!;
check(
  'laporan: blok Kanal Tayang berisi 4 kategori kanal',
  kanalSheet.rows.length === 4 && kanalSheet.rows.some((r) => String(r.channel).includes('Onair & Medsos')),
  kanalSheet.rows.map((r) => `${r.channel}:${r.total}`).join(' | ')
);
const airCatSheet = payload.sheets.find((s) => s.name === 'Tayang per Kategori')!;
check('laporan: blok Tayang per Kategori punya kolom onair/medsos', airCatSheet.rows.every((r) => 'onair' in r && 'medsos' in r));
const bureauSheetAir = payload.sheets.find((s) => s.name === 'Per Biro')!;
check('laporan: blok Per Biro punya kolom onair/medsos', bureauSheetAir.columns.some((c) => c.key === 'onair') && bureauSheetAir.columns.some((c) => c.key === 'medsos'));
check('laporan: ringkasan memuat total & periode', payload.summaryItems.some((i) => i.label === 'Total kiriman' && i.value === '3') && payload.summaryItems.some((i) => i.label === 'Periode laporan'));
check('laporan: setiap baris blok punya semua kolom', payload.sheets.every((s) => s.rows.every((r) => s.columns.every((c) => r[c.key] !== undefined))));
const bureauSheet = payload.sheets.find((s) => s.name === 'Per Biro')!;
check('laporan: tayang % dihitung benar', bureauSheet.rows[0].rate === '50%', String(bureauSheet.rows[0].rate));
check(
  'laporan: ringkasan CSV dapat disusun dari summaryItems',
  reportCsvSummary(payload.summaryItems).length === payload.summaryItems.length &&
    reportCsvSummary(payload.summaryItems).every((r) => r.length === 2)
);
check(
  'laporan: setiap blok rekap dapat ditulis sebagai tabel CSV',
  payload.sheets.every((sheet) => {
    const csv = buildCsv(
      sheet.columns.map((c) => c.header),
      sheet.rows.map((r) => sheet.columns.map((c) => r[c.key] ?? ''))
    );
    return csv.startsWith('"') && csv.split('\r\n').length === sheet.rows.length + 1;
  })
);

console.log(`\n${pass}/${pass + fail} pemeriksaan unit ekspor lulus`);
if (fail) process.exit(1);
