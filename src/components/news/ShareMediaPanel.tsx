'use client';

import { useActionState, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import SubmitButton from '@/components/ui/SubmitButton';
import CopyButton from '@/components/ui/CopyButton';
import { BASE_PATH } from '@/lib/base';
import { SHARE_EXPIRY_OPTIONS } from '@/lib/share-constants';
import { formatDateTimeID, formatBytes } from '@/lib/utils';
import { createShareLinkAction, type ShareLinkState } from '@/actions/share';

export type ShareableAsset = {
  id: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

const isVideo = (m: string) => m.startsWith('video/');
const isImage = (m: string) => m.startsWith('image/');

/** Tautan unduhan untuk pengguna yang sudah login. */
export const downloadPath = (storageKey: string) => `/api/media/${storageKey}?download=1`;
/** Tautan pratinjau untuk pengguna yang sudah login. */
export const viewPath = (storageKey: string) => `/api/media/${storageKey}`;

/**
 * Panel "Bagikan ke Tamu" — membuat tautan bertanda tangan (tanpa akun newsroom)
 * untuk seluruh lampiran footage/gambar satu berita.
 */
export function ShareNewsPanel({ newsId, assetCount }: { newsId: string; assetCount: number }) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [state, action] = useActionState<ShareLinkState, FormData>(createShareLinkAction, {});

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const shareUrl = state?.path ? `${origin}${BASE_PATH}${state.path}` : '';

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-accent"
        onClick={() => setOpen(true)}
        disabled={!assetCount}
        title={assetCount ? 'Buat tautan untuk tamu (mis. video editor)' : 'Belum ada lampiran'}
      >
        <Icon name="external" size={13} /> Bagikan ke Tamu
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Bagikan Materi ke Tamu"
        description="Buat tautan tanpa login untuk video editor/tamu lain. Tautan hanya dapat mengakses lampiran berita ini dan akan kedaluwarsa otomatis."
        maxWidth="max-w-xl"
      >
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="newsId" value={newsId} />

          <div>
            <span className="label">Masa berlaku tautan</span>
            <div className="flex flex-wrap gap-1.5">
              {SHARE_EXPIRY_OPTIONS.map((o) => (
                <label key={o.days} className="btn btn-sm cursor-pointer has-[:checked]:btn-primary">
                  <input
                    type="radio"
                    name="days"
                    value={o.days}
                    defaultChecked={o.days === 7}
                    className="mr-1.5 accent-[color:var(--brand)]"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <p className="hint mt-1">
              Setelah kedaluwarsa, tamu harus meminta tautan baru — berguna agar footage tidak beredar selamanya.
            </p>
          </div>

          {state?.error ? (
            <p className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
              {state.error}
            </p>
          ) : null}

          {state?.ok && shareUrl ? (
            <div className="panel-soft flex flex-col gap-2 p-3">
              <p className="text-[12px] font-semibold">
                Tautan siap dibagikan — {state.assetCount} berkas, berlaku {state.days} hari
                {state.expiresAt ? ` (sampai ${formatDateTimeID(state.expiresAt)})` : ''}.
              </p>
              <input readOnly value={shareUrl} className="input mono !text-[11.5px]" onFocus={(e) => e.currentTarget.select()} />
              <div className="flex flex-wrap gap-1.5">
                <CopyButton value={shareUrl} label="Salin Tautan" className="btn btn-sm btn-primary" />
                <a href={shareUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
                  <Icon name="external" size={13} /> Buka Halaman Tamu
                </a>
              </div>
              <p className="hint">
                Tautan ini tidak perlu akun newsroom. Tamu dapat memutar pratinjau lalu mengunduh footage/gambar.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Tutup
            </button>
            <SubmitButton className="btn btn-accent" pendingText="Membuat tautan…">
              <Icon name="external" size={14} /> Buat Tautan Tamu
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Tombol unduh + salin tautan untuk satu berkas (dipakai di halaman detail & daftar lampiran). */
export function AssetActions({
  newsId,
  asset,
  compact = false,
}: {
  newsId: string;
  asset: ShareableAsset;
  compact?: boolean;
}) {
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const makeLink = async () => {
    setBusy(true);
    setNotice('');
    try {
      const fd = new FormData();
      fd.append('mediaId', asset.id);
      fd.append('newsId', newsId);
      fd.append('days', '7');
      const res = await createShareLinkAction({}, fd);
      if (!res.ok || !res.path) {
        setNotice(res.error || 'Gagal membuat tautan.');
        return;
      }
      const url = `${origin}${BASE_PATH}${res.path}`;
      setShareUrl(url);
      setNotice('Tautan berkas dibuat (berlaku 7 hari).');
    } catch (e) {
      setNotice(`Gagal membuat tautan: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
      <a
        href={`${BASE_PATH}${downloadPath(asset.storageKey)}`}
        className="btn btn-sm"
        download={asset.filename}
        title={`Unduh ${asset.filename} (${formatBytes(asset.size)})`}
      >
        <Icon name="download" size={13} /> Unduh
      </a>

      {shareUrl ? (
        <CopyButton value={shareUrl} label="Salin tautan tamu" className="btn btn-sm" onCopied={() => setNotice('Tautan disalin.')} />
      ) : (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void makeLink()}
          disabled={busy}
          title="Buat tautan berbagi untuk berkas ini (tanpa login)"
        >
          <Icon name="external" size={13} /> {busy ? 'Menyiapkan…' : 'Tautan tamu'}
        </button>
      )}

      {notice ? (
        <span className="w-full text-[11px] text-muted" title={shareUrl || undefined}>
          {notice}
        </span>
      ) : null}
    </div>
  );
}
