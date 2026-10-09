'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { BASE_PATH } from '@/lib/base';
import CopyButton from '@/components/ui/CopyButton';
import { formatBytes } from '@/lib/utils';

export type SharedAsset = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Path API relatif (tanpa basePath) yang sudah memuat token. */
  viewPath: string;
  downloadPath: string;
  caption?: string;
};

const isVideo = (m: string) => m.startsWith('video/');
const isImage = (m: string) => m.startsWith('image/');

/**
 * Daftar berkas pada halaman berbagi publik (tamu: video editor dsb.):
 * pratinjau + tombol Unduh + tombol salin tautan berkas.
 */
export default function ShareAssetList({
  assets,
  copyAllText,
}: {
  assets: SharedAsset[];
  copyAllText?: string;
}) {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    // Origin asli harus diambil di browser agar tautan benar di domain apa pun.
    setOrigin(window.location.origin);
  }, []);

  const absolute = (path: string) => `${origin}${BASE_PATH}${path}`;

  if (!assets.length) {
    return (
      <p className="panel p-6 text-center text-[12.5px] text-muted">
        Tautan ini tidak memuat berkas apa pun. Hubungi pengirim untuk tautan baru.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {copyAllText ? (
        <div className="panel flex flex-wrap items-center gap-2 p-3">
          <Icon name="file" size={14} className="text-muted" />
          <span className="text-[12.5px] font-semibold">Salin semua tautan berkas</span>
          <span className="hint mr-auto">Berguna untuk dikirim ke editor melalui email/chat.</span>
          <CopyButton value={copyAllText} label="Salin semua" className="btn btn-sm" />
        </div>
      ) : null}

      {assets.map((a) => (
        <div key={a.id} className="panel overflow-hidden">
          <div className="flex flex-col gap-3 p-3 sm:flex-row">
            <div className="sm:w-[260px]">
              {isVideo(a.mimeType) ? (
                <video
                  controls
                  preload="metadata"
                  src={`${BASE_PATH}${a.viewPath}`}
                  className="h-40 w-full rounded-md bg-black object-contain"
                />
              ) : isImage(a.mimeType) ? (
                <a href={`${BASE_PATH}${a.viewPath}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${BASE_PATH}${a.viewPath}`}
                    alt={a.filename}
                    className="h-40 w-full rounded-md bg-panel3 object-cover"
                  />
                </a>
              ) : (
                <div className="grid h-40 w-full place-items-center rounded-md bg-panel3">
                  <Icon name="file" size={26} className="text-muted" />
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div>
                <p className="break-words text-[13.5px] font-bold leading-snug">{a.filename}</p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {isVideo(a.mimeType) ? 'Footage video' : isImage(a.mimeType) ? 'Gambar' : 'Dokumen'} ·{' '}
                  {formatBytes(a.size)}
                  {a.caption ? ` · ${a.caption}` : ''}
                </p>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                <a
                  href={`${BASE_PATH}${a.viewPath}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm"
                  title="Buka berkas di tab baru"
                >
                  <Icon name="eye" size={13} /> Lihat
                </a>
                <a
                  href={`${BASE_PATH}${a.downloadPath}`}
                  className="btn btn-sm btn-primary"
                  download={a.filename}
                  title="Unduh berkas"
                >
                  <Icon name="download" size={13} /> Unduh
                </a>
                <CopyButton
                  value={origin ? absolute(a.downloadPath) : a.downloadPath}
                  label="Salin tautan berkas"
                  title="Salin tautan berkas ini untuk dibagikan"
                />
              </div>
            </div>
          </div>
        </div>
      ))}

      <p className="text-[11.5px] text-muted">
        Semua berkas pada halaman ini hanya dapat diakses melalui tautan bertanda tangan ini.{' '}
        <Link href="/login" className="text-accent hover:underline">
          Masuk newsroom
        </Link>{' '}
        bila Anda bagian dari tim redaksi.
      </p>
    </div>
  );
}
