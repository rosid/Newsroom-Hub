import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { buildQuery } from '@/lib/utils';

export type TabView = 'list' | 'card';

/** Pengalih tampilan tabulasi: daftar tabel atau kartu 4 kolom (load more). */
export default function ViewToggle({
  view,
  basePath,
  params,
}: {
  view: TabView;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const options: { key: TabView; label: string; icon: string; hint: string }[] = [
    { key: 'list', label: 'Daftar', icon: 'rows', hint: 'Tabel padat dengan pagination' },
    { key: 'card', label: 'Kartu', icon: 'grid', hint: 'Grid 4 kolom, muat 20 kartu lagi' },
  ];

  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 p-0.5" role="group" aria-label="Pilih tampilan tabulasi">
      {options.map((o) => {
        const active = view === o.key;
        return (
          <Link
            key={o.key}
            href={buildQuery(basePath, { ...params, view: o.key === 'card' ? 'card' : undefined, page: undefined })}
            aria-current={active ? 'true' : undefined}
            title={o.hint}
            className={`btn btn-sm gap-1.5 ${active ? 'btn-primary' : '!border-transparent !bg-transparent'}`}
          >
            <Icon name={o.icon} size={13} />
            <span className="hidden sm:inline">{o.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
