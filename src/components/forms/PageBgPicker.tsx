'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';

/**
 * Pemilih WARNA LATAR halaman login.
 *
 * Kenapa komponen terpisah dengan dua state (`color` vs `draft`):
 * meneruskan teks yang belum lengkap (mis. "#d61f2") ke `<input type="color">` membuat browser
 * memaksanya menjadi `#000000` — akibatnya warna bisa tersimpan HITAM tanpa pengguna sadar.
 * Ini bug yang sudah pernah terjadi di proyek ini (lihat ColorPresets), jadi polanya disamakan:
 * - `color` selalu #RRGGBB valid (+ string kosong = "ikut tema bawaan"), dipakai pemilih warna
 *   DAN dikirim ke form lewat input hidden bernama `pageBgColor`;
 * - `draft` adalah teks yang sedang diketik (boleh belum lengkap) dan hanya untuk tampilan.
 *
 * Nilai kosong = TIDAK mengubah apa pun: halaman login memakai latar tema bawaan (perilaku lama),
 * sehingga fitur ini tidak mengubah tampilan sampai pengelola benar-benar memilih warna.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Preset cepat agar pengelola tidak perlu mengetik kode warna. */
const PRESETS = [
  { name: 'Malam Newsroom', value: '#0a0c10' },
  { name: 'Abu Redaksi', value: '#12161c' },
  { name: 'Biru Siaran', value: '#0f1e3d' },
  { name: 'Merah Garuda', value: '#2a0f14' },
  { name: 'Terang', value: '#f1f2f5' },
];

export default function PageBgPicker({ defaultColor = '' }: { defaultColor?: string }) {
  const valid = HEX.test(String(defaultColor ?? ''));
  // '' berarti "ikut tema bawaan" — dibedakan dari warna gelap apa pun.
  const [color, setColor] = useState(valid ? defaultColor.toLowerCase() : '');
  const [draft, setDraft] = useState(valid ? defaultColor.toLowerCase() : '');
  const usingDefault = color === '';

  const type = (raw: string) => {
    setDraft(raw);
    if (HEX.test(raw.trim())) setColor(raw.trim().toLowerCase());
  };

  const pickPreset = (value: string) => {
    setColor(value);
    setDraft(value);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="login-pageBgColor">
            Warna latar halaman (#RRGGBB)
          </label>
          <div className="flex items-center gap-2">
            {/*
              Pemilih warna bawaan browser: nilainya selalu warna valid. Saat memakai latar
              bawaan, pemilih ditampilkan sebagai hitam netral tetapi TIDAK dikirim ke form.
            */}
            <input
              id="login-pageBgColor"
              type="color"
              aria-label="Pilih warna latar halaman"
              className="h-9 w-12 cursor-pointer rounded-md border border-line bg-panel2 p-1"
              value={usingDefault ? '#0a0c10' : color}
              onChange={(e) => pickPreset(e.target.value.toLowerCase())}
              data-page-bg-picker
            />
            <input
              className="input mono !w-[132px]"
              placeholder="#0a0c10"
              value={draft}
              onChange={(e) => type(e.target.value)}
              aria-label="Kode warna latar"
              data-page-bg-text
            />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            setColor('');
            setDraft('');
          }}
          data-page-bg-reset
        >
          <Icon name="refresh" size={13} /> Ikuti tema bawaan
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => pickPreset(p.value)}
            className={`btn btn-sm ${color === p.value ? 'btn-primary' : ''}`}
            data-page-bg-preset={p.value}
          >
            <span className="inline-block h-3 w-3 rounded-full border border-line" style={{ background: p.value }} />
            {p.name}
          </button>
        ))}
      </div>

      {/* Nilai yang benar-benar dikirim ke server action ('' = ikut tema bawaan). */}
      <input type="hidden" name="pageBgColor" value={color} data-page-bg-value />

      {/* Peringatan bila yang diketik belum lengkap — nilai setengah jadi tidak dikirim. */}
      {draft !== '' && !HEX.test(draft) ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--warn)_40%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--warn)]">
          <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
          <span>
            Kode warna belum lengkap (format <span className="mono">#RRGGBB</span>). Yang tersimpan
            tetap nilai terakhir yang valid{usingDefault ? ' — saat ini: ikut tema bawaan' : `: ${color}`}.
          </span>
        </p>
      ) : null}

      <p className="hint">
        {usingDefault
          ? 'Saat ini mengikuti tema bawaan (gelap/terang). Pilih warna untuk memakai latar khusus.'
          : `Latar khusus aktif: ${color}. Tema hanya menentukan warna teks.`}
      </p>

      {/* Pratinjau kecil agar perubahan langsung terlihat. */}
      {!usingDefault ? (
        <div
          className="rounded-lg border border-line p-3 text-[11.5px]"
          style={{
            background: `linear-gradient(180deg, color-mix(in srgb, ${color} 88%, #fff), color-mix(in srgb, ${color} 82%, #000))`,
            color: '#fff',
          }}
          data-page-bg-preview
        >
          Pratinjau latar halaman
        </div>
      ) : null}
    </div>
  );
}
