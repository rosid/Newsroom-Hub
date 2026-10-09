import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { PRIORITY_BADGE, PRIORITY_LABELS } from '@/lib/constants';
import { excerpt, stripHtml } from '@/lib/sanitize';
import { formatDateShortID, timeAgo } from '@/lib/utils';
import type { Announcement } from '@prisma/client';

/** Titik indikator hanya untuk pengumuman penting/urgent (warna mengikuti tema). */
const DOT: Record<Announcement['priority'], string | null> = {
  NORMAL: null,
  PENTING: 'announce-dot announce-dot-warn',
  URGENT: 'announce-dot announce-dot-danger',
};

/**
 * Banner pengumuman di dashboard — diletakkan paling atas agar pengumuman redaksi
 * langsung terlihat oleh pengguna yang login. Warna mengikuti tema aplikasi
 * (`--panel`/`--line`/`--accent`), hanya diberi garis aksen kiri sebagai penanda.
 * Tidak dirender bila tidak ada pengumuman aktif yang relevan bagi pengguna.
 */
export default function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  if (!announcements.length) return null;

  return (
    <section className="announce-banner" data-announcement-banner aria-label="Pengumuman Redaksi">
      <div className="announce-head flex flex-wrap items-center gap-2.5 rounded-t-[9px] px-4 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-panel3 text-accent">
          <Icon name="megaphone" size={15} />
        </span>
        <h2 className="text-[13px] font-extrabold uppercase tracking-widest">Pengumuman Redaksi</h2>
        <span className="badge badge-muted">
          <span className="announce-dot" /> {announcements.length} aktif
        </span>
        <Link href="/dashboard/pengumuman" className="btn btn-sm ml-auto">
          Semua pengumuman
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-2.5 p-4 md:grid-cols-2 xl:grid-cols-3">
        {announcements.map((a) => (
          <li key={a.id}>
            <Link href="/dashboard/pengumuman" className="announce-card flex h-full flex-col p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={PRIORITY_BADGE[a.priority]}>
                  {DOT[a.priority] ? <span className={DOT[a.priority]!} /> : null}
                  {PRIORITY_LABELS[a.priority]}
                </span>
                <span className="text-[10.5px] text-muted">{timeAgo(a.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-[13px] font-bold leading-snug">{a.title}</p>
              <p className="mt-1 line-clamp-3 text-[11.5px] leading-snug text-muted">{excerpt(stripHtml(a.body), 180)}</p>
              <p className="mt-2 text-[10.5px] text-muted">
                Oleh {a.createdByName}
                {a.expiresAt ? ` · berakhir ${formatDateShortID(a.expiresAt)}` : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
