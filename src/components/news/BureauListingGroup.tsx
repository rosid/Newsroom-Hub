'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { kindMeta } from '@/lib/news-kinds';
import { STATUS_BADGE, STATUS_LABELS } from '@/lib/constants';
import { formatDateTimeID } from '@/lib/utils';

/**
 * Satu kelompok tabel untuk halaman Listing Berita (per Biro) — bisa dilipat.
 *
 * Memakai `<details>` bawaan browser (tanpa JavaScript tambahan) supaya tetap dapat dibuka
 * walau hidrasi belum selesai, dan bisa dibuka-tutup tanpa memuat ulang halaman.
 * Kolom mengikuti permintaan: No. Berita | Judul | Jenis | Kategori | Sumber | Waktu Kirim | Buka
 */
export type ListingRow = {
  id: string;
  code: string;
  title: string;
  kind: string;
  category: string;
  status: string;
  source: string;
  createdAt: string;
};

export default function BureauListingGroup({
  bureauName,
  bureauCode,
  rows,
  defaultOpen = true,
}: {
  bureauName: string;
  bureauCode: string | null;
  rows: ListingRow[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="panel shadow-soft overflow-hidden" data-listing-bureau>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-listing-toggle
        className="flex w-full flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 text-left hover:bg-panel2"
      >
        <Icon name={open ? 'rows' : 'grid'} size={14} className="text-muted" />
        <h2 className="text-[13.5px] font-bold">{bureauName}</h2>
        {bureauCode ? <span className="badge badge-muted mono !py-0">{bureauCode}</span> : null}
        <span className="badge badge-accent !py-0" data-listing-count>
          {rows.length} berita didorong ke pusat
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted">
          {open ? 'Sembunyikan' : 'Tampilkan'}
          <Icon name={open ? 'back' : 'next'} size={12} className={open ? 'rotate-90' : 'rotate-90'} />
        </span>
      </button>

      {open ? (
        <div className="overflow-x-auto">
          <table className="dtable" data-listing-table>
            <thead>
              <tr>
                <th style={{ width: 130 }}>No. Berita</th>
                <th>Judul</th>
                <th style={{ width: 140 }}>Jenis</th>
                <th style={{ width: 130 }}>Kategori</th>
                <th style={{ width: 170 }}>Sumber</th>
                <th style={{ width: 150 }}>Waktu Kirim</th>
                <th style={{ width: 76 }}>Buka</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="flex flex-col gap-1">
                      <span className="mono text-muted">{r.code}</span>
                      <span className={STATUS_BADGE[r.status as keyof typeof STATUS_BADGE] ?? 'badge badge-muted'}>
                        {STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status}
                      </span>
                    </div>
                  </td>
                  <td>
                    <Link
                      href={`/dashboard/tabulasi/berita/${r.id}`}
                      className="text-[13.5px] font-semibold leading-snug hover:text-accent"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td>
                    <span className={kindMeta(r.kind).badge}>{kindMeta(r.kind).short}</span>
                  </td>
                  <td>
                    <span className="badge badge-muted !py-0">{r.category}</span>
                  </td>
                  <td className="text-[12.5px]">{r.source}</td>
                  <td className="text-[12px] text-muted">{formatDateTimeID(r.createdAt)}</td>
                  <td>
                    <Link
                      href={`/dashboard/tabulasi/berita/${r.id}`}
                      className="btn btn-sm"
                      data-listing-open
                      aria-label={`Buka berita ${r.code}`}
                    >
                      <Icon name="external" size={12} /> Buka
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
