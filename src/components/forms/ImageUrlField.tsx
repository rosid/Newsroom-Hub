'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { BASE_PATH } from '@/lib/base';
import { isPublicImageUrl } from '@/lib/login-content';

/**
 * Kolom URL gambar + tombol unggah.
 *
 * Kenapa ada: beberapa gambar pengaturan (logo, gambar hero halaman login) harus berupa
 * URL yang bisa dibuka TANPA login. Sebelumnya kolom ini hanya teks biasa sehingga
 * pengelola harus mengunggah sendiri di tempat lain lalu menempelkan URL-nya.
 *
 * PENTING — perbedaan mode storage (jangan diubah tanpa memahami ini):
 * - Mode S3/CDN dengan "URL publik" terisi → berkas dapat URL `https://…` yang aman
 *   dipakai di halaman PUBLIK (halaman login).
 * - Mode lokal, atau S3 tanpa URL publik → halaman unggah mengembalikan `local:…`/`s3:…`,
 *   yang hanya dapat dilayani `/api/media/...` (butuh sesi login). Nilai itu TIDAK akan
 *   tampil bagi pengunjung, jadi kolom ini MENOLAK menyimpannya dan menampilkan
 *   peringatan agar pengelola memperbaiki pengaturan storage lebih dulu.
 *
 * Nilai akhir tetap dikirim lewat input tersembunyi bernama `name` supaya server action
 * tidak perlu tahu soal unggahan.
 */
export default function ImageUrlField({
  name,
  defaultValue = '',
  placeholder = 'https://…/gambar.jpg',
  label = 'URL gambar',
  hint,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  hint?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Bersihkan pesan saat nilai berubah manual.
  useEffect(() => {
    if (!value) setNotice('');
  }, [value]);

  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = new FormData();
      body.append('files', file);
      const res = await fetch(`${BASE_PATH}/api/media/upload`, { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        assets?: { url?: string; filename?: string }[];
      };
      if (!res.ok || !data.ok) {
        setError(data.error || `Gagal mengunggah (HTTP ${res.status}).`);
        return;
      }
      const url = String(data.assets?.[0]?.url ?? '');
      if (!url) {
        setError('Unggahan berhasil tetapi URL berkas tidak diterima. Coba lagi.');
        return;
      }
      if (!isPublicImageUrl(url)) {
        // Nilai local:/s3: hanya bisa dibuka lewat /api/media (butuh login) → tidak akan
        // tampil di halaman publik. Jangan simpan, agar halaman login tidak "hilang gambar".
        setError(
          'Berkas tersimpan, tetapi penyimpanan Anda belum punya URL publik/CDN sehingga gambar ini tidak akan tampil bagi pengunjung halaman login. Isi "URL publik (CDN)" di Pengaturan → Storage & Integrasi, atau tempel URL gambar publik secara manual.'
        );
        return;
      }
      setValue(url);
      setNotice('Gambar berhasil diunggah dan dipakai.');
    } catch (e) {
      setError(`Gagal mengunggah: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const preview = isPublicImageUrl(value) ? value : '';

  return (
    <div className="flex flex-col gap-2">
      <label className="label" htmlFor={`${name}-url`}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`${name}-url`}
          className="input min-w-[220px] flex-1"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          data-image-url
        />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name={busy ? 'clock' : 'image'} size={13} /> {busy ? 'Mengunggah…' : 'Unggah'}
        </button>
        {value ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setValue('');
              setError('');
              setNotice('');
            }}
          >
            <Icon name="x" size={13} /> Kosongkan
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          data-image-file
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>

      {/* Nilai yang benar-benar dikirim ke server action. */}
      <input type="hidden" name={name} value={value} />

      {preview ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel2 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Pratinjau gambar" className="h-14 w-24 rounded object-cover" />
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{preview}</span>
        </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
          <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {notice ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
          <Icon name="check" size={14} className="mt-[2px] shrink-0" />
          <span>{notice}</span>
        </p>
      ) : null}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}
