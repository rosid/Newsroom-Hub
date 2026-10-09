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

/** Pemisah ; + tanda kutip ganda mengikuti kebiasaan Excel/Indonesia (aman untuk koma & newline). */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\r\n');
}
