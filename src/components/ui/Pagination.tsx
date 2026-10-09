import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { buildQuery } from '@/lib/utils';

/**
 * Pagination server component. Kirim `params` sebagai objek biasa (BUKAN fungsi)
 * agar aman dilewatkan dari server ke komponen ini.
 */
export default function Pagination({
  page,
  pages,
  basePath,
  params = {},
  hash = '',
}: {
  page: number;
  pages: number;
  basePath: string;
  params?: Record<string, string | number | undefined | null>;
  hash?: string;
}) {
  if (pages <= 1) return null;

  const href = (n: number) => `${buildQuery(basePath, { ...params, page: n })}${hash}`;
  const windowSize = 2;
  const numbers: number[] = [];
  for (let n = Math.max(1, page - windowSize); n <= Math.min(pages, page + windowSize); n += 1) numbers.push(n);
  if (!numbers.includes(1)) numbers.unshift(1);
  if (!numbers.includes(pages)) numbers.push(pages);

  const items: (number | '…')[] = [];
  numbers.forEach((n, i) => {
    if (i > 0 && n - (numbers[i - 1] as number) > 1) items.push('…');
    items.push(n);
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5">
      <p className="text-[11.5px] text-muted">
        Halaman <span className="font-semibold text-ink">{page}</span> dari {pages}
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={href(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={`btn btn-sm ${page <= 1 ? 'pointer-events-none opacity-45' : ''}`}
        >
          <Icon name="back" size={13} /> Sebelumnya
        </Link>
        {items.map((it, i) =>
          it === '…' ? (
            <span key={`e${i}`} className="px-1 text-[12px] text-muted">
              …
            </span>
          ) : (
            <Link
              key={it}
              href={href(it)}
              className={`btn btn-sm !px-2.5 ${it === page ? 'btn-primary' : ''}`}
            >
              {it}
            </Link>
          )
        )}
        <Link
          href={href(Math.min(pages, page + 1))}
          aria-disabled={page >= pages}
          className={`btn btn-sm ${page >= pages ? 'pointer-events-none opacity-45' : ''}`}
        >
          Berikutnya <Icon name="next" size={13} />
        </Link>
      </div>
    </div>
  );
}
