/**
 * Pembuat berkas ekspor (CSV) untuk laporan & tabulasi.
 * Dipakai route /api/export/*. Modul ini hanya berjalan di server.
 *
 * CATATAN KEPUTUSAN (jangan dikembalikan tanpa diminta):
 * Ekspor **PDF** dan **Excel (.xlsx)** DIHAPUS atas permintaan pemilik aplikasi untuk
 * mengurangi beban VPS — keduanya memuat `pdfkit`/`exceljs`, merakit berkas besar di
 * memori proses, dan menjadi burst CPU/RAM pada tiap permintaan. CSV dibangun sebagai
 * string biasa (tanpa dependensi) sehingga hampir tanpa biaya server. Jangan menambahkan
 * kembali `pdfkit`/`exceljs` (juga ke next.config `serverExternalPackages`) kecuali diminta.
 */

export type ExportColumn = {
  header: string;
  key: string;
};

export type ExportSheet = {
  name: string;
  title?: string;
  columns: ExportColumn[];
  rows: Record<string, string | number>[];
};

// ===================== CSV =====================

/**
 * Sel yang WAJIB dinetralkan agar tidak dievaluasi sebagai formula oleh Excel/
 * LibreOffice/Google Sheets (perbaikan audit Tahap 2 — SAN-1, CWE-1236
 * "CSV Formula Injection").
 *
 * Kenapa perlu: kolom seperti Judul, Lokasi, Ringkasan, Tag, dan Nama reporter berisi
 * teks yang diketik reporter. Sebuah judul `=cmd|' /C calc'!A0` (atau `@SUM(...)`,
 * `=HYPERLINK(...)`) akan dieksekusi sebagai formula saat admin/redaktur membuka berkas
 * ekspor — termasuk varian DDE yang dapat memanggil program di komputer pembuka.
 *
 * Cara kerja: nilai yang diawali `=`, `+`, `-`, `@`, TAB, atau CR diberi awalan
 * apostrof (`'`) sehingga diperlakukan sebagai teks. DUA PENGECUALIAN PENTING (keduanya
 * menjaga agar data tetap utuh — jangan dilonggarkan):
 *
 * 1. ANGKA/KOORDINAT — mis. `-6.2000, 106.8166` (kolom Geo-tag) atau nomor telepon
 *    `+62812…`. Deretan angka tidak dapat menjadi formula. Pola `-2+3+cmd|…` sengaja
 *    TIDAK cocok dengan pola angka ini, sehingga tetap dinetralkan.
 * 2. TANDA/KOSONG — mis. sel placeholder `-` yang dipakai kolom "Geo-tag", "Waktu Tayang",
 *    dan "Waktu Siar" saat datanya belum ada. Sebuah `-` sendirian bukan formula, jadi
 *    TIDAK boleh berubah menjadi `'-` (pernah terjadi; merusak keterbacaan berkas ekspor).
 */
const NUMERIC_OR_COORDS = /^[-+]?\d+(?:[.,]\d+)?(?:\s*,\s*[-+]?\d+(?:[.,]\d+)?)?$/;
/** Hanya berisi tanda +/-, tanda hubung, dan spasi → tidak mungkin menjadi formula. */
const SIGNS_OR_BLANK = /^[-+\s]*$/;
const RISKY_PREFIX = /^[=+\-@\t\r]/;

function neutralizeFormula(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (!s || typeof value === 'number') return s;
  if (!RISKY_PREFIX.test(s)) return s;
  if (SIGNS_OR_BLANK.test(s) || NUMERIC_OR_COORDS.test(s)) return s;
  return `'${s}`;
}

/** Pemisah ; + tanda kutip ganda mengikuti kebiasaan Excel/Indonesia (aman untuk koma & newline). */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = neutralizeFormula(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\r\n');
}
