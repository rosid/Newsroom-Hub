'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { BASE_PATH } from '@/lib/base';
import {
  ACCEPT_ATTR,
  checkFile,
  formatBytesID,
  kindLabel,
  MAX_ATTACHMENTS,
} from '@/lib/media-limits';

export type UploadedAsset = {
  storageKey: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  type: 'IMAGE' | 'FOOTAGE';
};

type ItemStatus = 'queued' | 'uploading' | 'done' | 'error';

type UploadItem = {
  id: string;
  filename: string;
  size: number;
  status: ItemStatus;
  /** 0–100 */
  progress: number;
  loaded: number;
  error?: string;
  asset?: UploadedAsset;
  /**
   * true = lampiran ini SUDAH tersimpan di database (dari berita yang sedang diubah);
   * false/undefined = baru diunggah pada sesi ini.
   *
   * Dibedakan karena perlakuannya berbeda saat pengguna menekan tombol hapus:
   * - sudah tersimpan -> dihapus dari DB + storage saat SIMPAN (dilaporkan lewat `removedMedia`)
   * - baru diunggah   -> belum terpasang di berita mana pun; bila dibuang, objeknya yatim di
   *                      storage dan tetap perlu dibersihkan (juga lewat `removedMedia`)
   */
  existing?: boolean;
  /** Jalur yang benar-benar dipakai untuk berkas ini. */
  via?: 'direct' | 'server';
  /** Alasan mundur ke jalur server (bila unggahan langsung gagal). */
  fallbackReason?: string;
};

const uid = () => `${Date.now().toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`;

type PresignReply = {
  ok?: boolean;
  direct?: boolean;
  reason?: string;
  error?: string;
  uploads?: {
    filename: string;
    size: number;
    contentType: string;
    type: 'IMAGE' | 'FOOTAGE';
    storageKey: string;
    uploadUrl: string;
    expiresIn: number;
  }[];
};

/** Minta URL bertanda tangan. Balasan `direct:false` berarti harus lewat server. */
async function requestPresign(file: File): Promise<PresignReply> {
  try {
    const res = await fetch(`${BASE_PATH}/api/media/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ filename: file.name, size: file.size, contentType: file.type || 'application/octet-stream' }],
      }),
    });
    return (await res.json()) as PresignReply;
  } catch {
    // Tidak bisa menghubungi server → pakai jalur lama (lewat server) saja.
    return { ok: true, direct: false, reason: 'Tidak dapat meminta URL bertanda tangan.' };
  }
}

/** Unggah berkas LANGSUNG ke storage memakai URL bertanda tangan (byte tidak lewat server). */
function putDirect(
  file: File,
  signed: NonNullable<PresignReply['uploads']>[number],
  onProgress: (loaded: number, total: number) => void,
  registerAbort: (abort: () => void) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };
    registerAbort(() => {
      if (settled) return;
      settled = true;
      xhr.abort();
      reject(new Error('Dibatalkan'));
    });

    xhr.open('PUT', signed.uploadUrl);
    xhr.timeout = 0;
    // Content-Type ikut ditandatangani → WAJIB sama persis dengan yang dipakai saat menandatangani.
    xhr.setRequestHeader('Content-Type', signed.contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (settled) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        settled = true;
        resolve();
      } else {
        fail(`Storage menolak unggahan langsung (HTTP ${xhr.status}).`);
      }
    };
    xhr.onerror = () =>
      fail(
        'Unggahan langsung ke storage gagal — kemungkinan storage zone belum mengizinkan CORS (PUT + Content-Type), endpoint bukan HTTPS, atau jaringan terputus.'
      );
    xhr.ontimeout = () => fail('Waktu unggah langsung habis.');
    xhr.onabort = () => fail('Dibatalkan');

    xhr.send(file);
  });
}

/** Verifikasi objek hasil unggahan langsung (server memeriksa HEAD, tanpa mengunduh berkas). */
async function confirmDirect(
  file: File,
  signed: NonNullable<PresignReply['uploads']>[number]
): Promise<UploadedAsset> {
  const res = await fetch(`${BASE_PATH}/api/media/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storageKey: signed.storageKey,
      filename: file.name,
      size: file.size,
      mimeType: signed.contentType,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; assets?: UploadedAsset[] };
  if (!res.ok || !data.ok || !data.assets?.length) {
    throw new Error(data.error || `Verifikasi unggahan gagal (HTTP ${res.status}).`);
  }
  return data.assets[0];
}

/**
 * Unggah satu berkas lewat server memakai XHR agar progres unggahan dapat dipantau
 * (fetch tidak bisa). Dipakai untuk penyimpanan lokal DAN sebagai cadangan bila
 * unggahan langsung ke storage gagal.
 */
function uploadWithProgress(
  file: File,
  onProgress: (loaded: number, total: number) => void,
  registerAbort: (abort: () => void) => void
): Promise<UploadedAsset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };
    registerAbort(() => {
      if (settled) return;
      settled = true;
      xhr.abort();
      reject(new Error('Dibatalkan'));
    });

    xhr.open('POST', `${BASE_PATH}/api/media/upload`);
    xhr.timeout = 0; // footage besar bisa memakan waktu lama
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (settled) return;
      let data: { ok?: boolean; error?: string; assets?: UploadedAsset[] } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        return fail('Respons server tidak dapat dibaca.');
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.ok && data.assets?.length) {
        settled = true;
        resolve(data.assets[0]);
      } else {
        fail(data.error || `Gagal mengunggah (HTTP ${xhr.status}).`);
      }
    };
    xhr.onerror = () => fail('Koneksi terputus saat mengunggah. Periksa jaringan lalu coba lagi.');
    xhr.ontimeout = () => fail('Waktu unggah habis.');
    xhr.onabort = () => fail('Dibatalkan');

    const fd = new FormData();
    fd.append('files', file);
    xhr.send(fd);
  });
}

export type UploadOutcome = { asset: UploadedAsset; direct: boolean; fallbackReason?: string };

/**
 * Strategi unggah: coba LANGSUNG ke storage (pre-signed URL) lebih dulu agar footage
 * besar tidak membebani server web; bila tidak tersedia atau gagal (mis. CORS storage
 * zone belum mengizinkan), otomatis mundur ke jalur lewat server supaya unggahan tidak
 * pernah gagal hanya karena masalah penandatanganan/CORS.
 */
async function uploadFile(
  file: File,
  onProgress: (loaded: number, total: number) => void,
  registerAbort: (abort: () => void) => void,
  onAttempt: (attempt: 'direct' | 'server') => void
): Promise<UploadOutcome> {
  const presign = await requestPresign(file);
  const signed = presign.uploads?.[0];

  if (presign.ok && presign.direct && signed) {
    onAttempt('direct');
    try {
      await putDirect(file, signed, onProgress, registerAbort);
      const asset = await confirmDirect(file, signed);
      return { asset, direct: true };
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'Dibatalkan') throw e;
      // Mundur ke jalur server — dengan progres direset karena unggahan dimulai ulang.
      onAttempt('server');
      onProgress(0, file.size);
      const asset = await uploadWithProgress(file, onProgress, registerAbort);
      return { asset, direct: false, fallbackReason: message };
    }
  }

  onAttempt('server');
  const asset = await uploadWithProgress(file, onProgress, registerAbort);
  return { asset, direct: false, fallbackReason: presign.reason };
}

/**
 * Pengunggah footage/gambar dengan PROGRES per berkas dan dukungan BANYAK berkas
 * sekaligus (diproses berurutan agar footage besar tidak saling berebut bandwidth).
 * Tombol kirim pada form induk dinonaktifkan selama masih ada unggahan berjalan.
 */
export default function MediaUploader({
  name = 'media',
  initial = [],
  onNotice,
  onBusyChange,
}: {
  name?: string;
  initial?: UploadedAsset[];
  onNotice?: (msg: string) => void;
  /** true selama masih ada berkas yang menunggu/diunggah (dipakai untuk menonaktifkan tombol kirim). */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>(() =>
    initial.map((a) => ({
      id: uid(),
      filename: a.filename,
      size: a.size,
      status: 'done' as ItemStatus,
      progress: 100,
      loaded: a.size,
      asset: a,
      existing: true,
    }))
  );
  /**
   * Lampiran yang DIHAPUS pengguna pada sesi ini (storageKey-nya).
   *
   * Dikirim ke server lewat input tersembunyi `removedMedia` supaya saat berita disimpan,
   * server benar-benar menghapus barisnya di database DAN objeknya di storage.
   * Sebelumnya penghapusan hanya terjadi di tampilan (state React) sehingga berkas
   * "muncul kembali" setelah disimpan — inilah bug yang diperbaiki.
   */
  const [removedKeys, setRemovedKeys] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<string[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());
  const abortsRef = useRef<Map<string, () => void>>(new Map());
  const runningRef = useRef(false);

  const assets = useMemo(
    () => items.filter((i) => i.status === 'done' && i.asset).map((i) => i.asset as UploadedAsset),
    [items]
  );
  const pending = items.filter((i) => i.status === 'queued' || i.status === 'uploading');
  const failed = items.filter((i) => i.status === 'error');
  const fellBack = items.filter((i) => i.status === 'done' && i.via === 'server' && i.fallbackReason);
  const busy = pending.length > 0;

  useEffect(() => {
    onBusyChange?.(busy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  /** Proses antrean satu per satu. */
  const processQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (;;) {
        const nextId = queueRef.current.shift();
        if (!nextId) break;
        const file = filesRef.current.get(nextId);
        if (!file) continue;
        update(nextId, { status: 'uploading', progress: 0, loaded: 0, error: undefined, fallbackReason: undefined });
        try {
          const outcome = await uploadFile(
            file,
            (loaded, total) => update(nextId, { loaded, progress: total ? Math.round((loaded / total) * 100) : 0 }),
            (abort) => abortsRef.current.set(nextId, abort),
            (attempt) => update(nextId, { via: attempt, progress: 0, loaded: 0 })
          );
          update(nextId, {
            status: 'done',
            progress: 100,
            loaded: file.size,
            asset: outcome.asset,
            via: outcome.direct ? 'direct' : 'server',
            fallbackReason: outcome.direct ? undefined : outcome.fallbackReason,
          });
          // Sudah tersimpan di storage — objek File tidak diperlukan lagi
          filesRef.current.delete(nextId);
          onNotice?.(
            outcome.direct
              ? `${file.name} selesai diunggah langsung ke storage.`
              : `${file.name} selesai diunggah lewat server.`
          );
        } catch (e) {
          const message = (e as Error).message;
          if (message === 'Dibatalkan') {
            update(nextId, { status: 'error', error: 'Dibatalkan — berkas tidak diikutkan.', progress: 0, loaded: 0 });
          } else {
            update(nextId, { status: 'error', error: message, progress: 0, loaded: 0 });
            onNotice?.(`Gagal mengunggah ${file.name}: ${message}`);
          }
        } finally {
          abortsRef.current.delete(nextId);
          // Catatan: objek File SENGAJA disimpan agar tombol "Ulangi" dapat mengunggah
          // berkas yang gagal tanpa meminta pengguna memilih ulang. Dihapus saat sukses/dibuang.
        }
      }
    } finally {
      runningRef.current = false;
    }
    // Antrean bisa bertambah tepat saat loop berakhir — periksa sekali lagi
    if (queueRef.current.length) void processQueue();
  }, [onNotice, update]);

  /** Tambah berkas ke antrean (validasi jenis & ukuran dulu). */
  const enqueue = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      const list = Array.from(files);
      if (!list.length) return;

      const room = MAX_ATTACHMENTS - assets.length - pending.length;
      const accepted: File[] = [];
      const rejected: UploadItem[] = [];

      list.forEach((file, idx) => {
        const check = checkFile(file.name, file.size);
        if (!check.ok) {
          rejected.push({
            id: uid(),
            filename: file.name,
            size: file.size,
            status: 'error',
            progress: 0,
            loaded: 0,
            error: check.error,
          });
          return;
        }
        if (idx >= room) {
          rejected.push({
            id: uid(),
            filename: file.name,
            size: file.size,
            status: 'error',
            progress: 0,
            loaded: 0,
            error: `Melebihi batas ${MAX_ATTACHMENTS} lampiran per berita.`,
          });
          return;
        }
        accepted.push(file);
      });

      const newItems: UploadItem[] = accepted.map((file) => {
        const id = uid();
        filesRef.current.set(id, file);
        queueRef.current.push(id);
        return { id, filename: file.name, size: file.size, status: 'queued', progress: 0, loaded: 0, existing: false };
      });

      if (newItems.length || rejected.length) setItems((prev) => [...prev, ...newItems, ...rejected]);
      if (accepted.length) {
        onNotice?.(
          accepted.length > 1
            ? `${accepted.length} berkas masuk antrean unggahan.`
            : `${accepted[0].name} masuk antrean unggahan.`
        );
        void processQueue();
      }
      if (rejected.length) onNotice?.(rejected[0].error ?? 'Ada berkas yang tidak dapat diunggah.');
      if (inputRef.current) inputRef.current.value = '';
    },
    [assets.length, pending.length, onNotice, processQueue]
  );

  const retry = (item: UploadItem) => {
    const file = filesRef.current.get(item.id);
    if (!file) {
      // Berkas tidak lagi tersedia di memori (mis. ditolak validasi) — minta pilih ulang
      update(item.id, { error: 'Silakan pilih ulang berkas ini (berkas tidak lagi tersimpan di browser).' });
      inputRef.current?.click();
      return;
    }
    if (queueRef.current.includes(item.id)) return;
    queueRef.current.push(item.id);
    update(item.id, { status: 'queued', progress: 0, loaded: 0, error: undefined });
    void processQueue();
  };

  const cancel = (item: UploadItem) => {
    abortsRef.current.get(item.id)?.();
  };

  const remove = (id: string) => {
    queueRef.current = queueRef.current.filter((q) => q !== id);
    filesRef.current.delete(id);
    const target = items.find((it) => it.id === id);
    // Catat kunci berkasnya agar server dapat menghapus baris DB + objek storage saat simpan.
    const key = target?.asset?.storageKey;
    if (key && !removedKeys.includes(key)) setRemovedKeys((prev) => [...prev, key]);
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const retryAllFailed = () => {
    failed.forEach((f) => retry(f));
  };

  const totalSize = items.reduce((s, i) => s + i.size, 0);
  const totalLoaded = items.reduce((s, i) => s + (i.status === 'done' ? i.size : i.loaded), 0);
  const overall = totalSize ? Math.round((totalLoaded / totalSize) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(assets)} />
      {/* Daftar lampiran yang dihapus pengguna — dibaca server saat menyimpan berita. */}
      <input type="hidden" name="removedMedia" value={JSON.stringify(removedKeys)} data-removed-media />

      {/* Area pilih / tarik-lepas */}
      <div
        className="panel-soft flex flex-col items-center gap-2 border-dashed px-4 py-5 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          enqueue(e.dataTransfer.files);
        }}
      >
        <Icon name="cloud" size={20} className="text-muted" />
        <p className="text-[12.5px] font-semibold">
          Tarik &amp; lepas <span className="text-accent">beberapa footage/gambar sekaligus</span> di sini
        </p>
        <p className="text-[11.5px] text-muted">
          Bisa banyak berkas dalam satu kali kirim · video mp4/webm/mov (maks 300 MB), gambar jpg/png/webp (maks 25 MB),
          dokumen pendukung (maks 50 MB) · maksimal {MAX_ATTACHMENTS} lampiran per berita
        </p>
        <p className="text-[11px] text-muted">
          Bila storage cloud aktif, berkas diunggah <strong>langsung ke storage</strong> sehingga server web tidak terbebani
          footage besar.
        </p>
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()}>
          <Icon name="plus" size={13} /> Pilih Berkas{items.length ? ' Lagi' : ''}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPT_ATTR}
          onChange={(e) => enqueue(e.target.files)}
        />
      </div>

      {/* Progres keseluruhan */}
      {busy ? (
        <div className="panel-soft flex flex-col gap-1.5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Icon name="cloud" size={13} className="text-accent" />
              Mengunggah {pending.length} berkas… {overall}%
            </span>
            <span className="text-muted">
              {formatBytesID(totalLoaded)} / {formatBytesID(totalSize)}
            </span>
          </div>
          <ProgressBar value={overall} />
        </div>
      ) : null}

      {failed.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[11.5px] text-danger">
          <Icon name="alert" size={13} />
          <span>
            {failed.length} berkas gagal — <strong>tidak akan ikut terkirim</strong>. Coba ulangi atau hapus dari daftar.
          </span>
          <button type="button" className="btn btn-sm" onClick={retryAllFailed}>
            <Icon name="refresh" size={12} /> Coba lagi semua
          </button>
        </div>
      ) : null}

      {fellBack.length && !busy ? (
        <div className="panel-soft flex items-start gap-2 p-3 text-[11.5px]">
          <Icon name="alert" size={13} className="mt-[2px] shrink-0 text-muted" />
          <span>
            {fellBack.length} berkas dikirim lewat server karena unggahan langsung ditolak ({fellBack[0].fallbackReason}). Agar
            footage besar tidak membebani server web: izinkan <strong>CORS</strong> pada storage zone (metode{' '}
            <span className="mono">PUT</span>, header <span className="mono">Content-Type</span>, origin aplikasi ini) dan
            pastikan endpoint storage memakai <strong>HTTPS</strong> — lihat Pengaturan → Storage &amp; Integrasi.
          </span>
        </div>
      ) : null}

      {/* Daftar berkas dengan progres masing-masing */}
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="panel-soft flex flex-col gap-2 p-2.5">
              <div className="flex items-center gap-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
                  style={{ background: 'var(--panel-3)' }}
                  aria-hidden="true"
                >
                  <Icon
                    name={
                      it.status === 'done'
                        ? it.asset?.type === 'IMAGE'
                          ? 'image'
                          : 'video'
                        : it.status === 'error'
                          ? 'alert'
                          : 'cloud'
                    }
                    size={15}
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold" title={it.filename}>
                    {it.filename}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {kindLabel(it.asset?.mimeType ?? '', it.filename)} · {formatBytesID(it.size)}
                    {it.status === 'uploading' ? ` · ${formatBytesID(it.loaded)} terkirim (${it.progress}%)` : ''}
                    {it.status === 'queued' ? ' · menunggu antrean' : ''}
                    {it.status === 'uploading' && it.via === 'direct' ? ' · langsung ke storage' : ''}
                    {it.status === 'uploading' && it.via === 'server' ? ' · lewat server' : ''}
                    {it.status === 'done'
                      ? ` · selesai${it.via === 'direct' ? ' · langsung ke storage' : it.asset?.url.startsWith('http') ? ' · tersimpan di storage' : ' · tersimpan di server'}`
                      : ''}
                  </span>
                  {it.status === 'done' && it.via === 'server' && it.fallbackReason ? (
                    <span className="mt-0.5 block text-[10.5px] text-muted">
                      Unggahan langsung tidak tersedia ({it.fallbackReason}) — berkas dikirim lewat server.
                    </span>
                  ) : null}
                </span>

                {/* Aksi */}
                <span className="flex shrink-0 items-center gap-1.5">
                  {it.status === 'done' ? (
                    <span className="badge badge-ok">
                      <Icon name="check" size={11} /> Selesai
                    </span>
                  ) : null}
                  {it.status === 'uploading' ? (
                    <button type="button" className="btn btn-sm" onClick={() => cancel(it)} title="Batalkan unggahan">
                      <Icon name="x" size={12} /> Batal
                    </button>
                  ) : null}
                  {it.status === 'error' ? (
                    <button type="button" className="btn btn-sm" onClick={() => retry(it)} title="Coba unggah lagi">
                      <Icon name="refresh" size={12} /> Ulangi
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => remove(it.id)}
                    title={it.status === 'done' ? 'Keluarkan dari daftar lampiran' : 'Hapus dari daftar'}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </span>
              </div>

              {it.status === 'uploading' || it.status === 'queued' ? (
                <div className="flex items-center gap-2">
                  <ProgressBar value={it.progress} />
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted">{it.progress}%</span>
                </div>
              ) : null}

              {it.status === 'error' && it.error ? (
                <p className="text-[11.5px] text-danger">{it.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">
          Belum ada lampiran. Reporter disarankan mengunggah minimal 1 footage atau gambar (boleh lebih dari satu
          sekaligus).
        </p>
      )}

      {assets.length ? (
        <p className="hint">
          {assets.length} lampiran siap ikut terkirim
          {assets.length > 1 ? ` (total ${formatBytesID(assets.reduce((s, a) => s + a.size, 0))})` : ''}.
        </p>
      ) : null}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span
      className="block h-2 flex-1 overflow-hidden rounded-full bg-panel3"
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
      data-progress={safe}
    >
      <span
        className="block h-full rounded-full transition-all duration-200"
        style={{ width: `${safe}%`, background: safe >= 100 ? 'var(--ok)' : 'var(--accent)' }}
      />
    </span>
  );
}
