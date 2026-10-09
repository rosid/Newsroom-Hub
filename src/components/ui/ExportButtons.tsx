import Icon from '@/components/ui/Icon';
import { p } from '@/lib/base';

export type ExportFormatOption = { format: 'csv'; label: string; icon: string };

/**
 * Tombol ekspor — HANYA CSV.
 * CATATAN KEPUTUSAN: tombol Excel & PDF dihapus atas permintaan pemilik aplikasi
 * (mengurangi beban VPS). Jangan menambahkan format lain tanpa diminta.
 *
 * PENTING: memakai <a href> biasa, sehingga basePath WAJIB ditambahkan lewat p() —
 * tanpa itu tautan diarahkan ke root domain dan menghasilkan 404 "No webpage was found"
 * saat aplikasi dipasang di subpath (mis. /newsroom-hub).
 */
const OPTIONS: ExportFormatOption[] = [{ format: 'csv', label: 'CSV', icon: 'download' }];

export default function ExportButtons({
  basePath,
  params,
  label = 'Ekspor',
}: {
  /** Endpoint ekspor, mis. '/api/export/news'. */
  basePath: string;
  params: Record<string, string | number | undefined | null>;
  label?: string;
}) {
  const url = (format: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      sp.set(k, String(v));
    }
    sp.set('format', format);
    return p(`${basePath}?${sp.toString()}`);
  };

  return (
    <div className="flex items-center gap-1.5" data-export-buttons>
      <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted sm:inline">
        {label}:
      </span>
      {OPTIONS.map((o) => (
        <a
          key={o.format}
          href={url(o.format)}
          className="btn btn-sm"
          data-export-format={o.format}
          title={`Unduh ${o.label} (dapat dibuka dengan Excel/Google Sheets)`}
        >
          <Icon name={o.icon} size={13} /> {o.label}
        </a>
      ))}
    </div>
  );
}
