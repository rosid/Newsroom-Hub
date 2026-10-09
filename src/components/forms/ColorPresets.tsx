'use client';

import { useState } from 'react';

const PRESETS = [
  { name: 'GarudaTV Merah', primary: '#d61f2c', accent: '#1d4ed8' },
  { name: 'Newsroom Biru', primary: '#1d4ed8', accent: '#0891b2' },
  { name: 'Siaran Nasional', primary: '#b91c1c', accent: '#f59e0b' },
  { name: 'Hijau Editorial', primary: '#047857', accent: '#0f766e' },
  { name: 'Ungu Malam', primary: '#7c3aed', accent: '#db2777' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const pick = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);

/**
 * Pemilih warna tema. Ada dua nilai per warna:
 * - `color` (selalu #RRGGBB valid) yang dikirim form & dipakai pemilih warna bawaan browser;
 * - `draft` teks yang sedang diketik pengguna (boleh belum lengkap).
 * Pemisahan ini penting: kolom teks tanpa penjagaan membuat nilai setengah jadi
 * (mis. "#d61f2") masuk ke input `type="color"` yang oleh browser dipaksa menjadi #000000 —
 * akibatnya warna tema bisa tersimpan sebagai hitam tanpa pengguna sadar.
 */
export default function ColorPresets({ primary, accent }: { primary: string; accent: string }) {
  const [p, setP] = useState(pick(primary, '#d61f2c'));
  const [a, setA] = useState(pick(accent, '#1d4ed8'));
  const [pDraft, setPDraft] = useState(p);
  const [aDraft, setADraft] = useState(a);

  const draftOk = (v: string) => HEX.test(v);

  const typePrimary = (raw: string) => {
    setPDraft(raw);
    if (draftOk(raw)) setP(raw.toLowerCase());
  };
  const typeAccent = (raw: string) => {
    setADraft(raw);
    if (draftOk(raw)) setA(raw.toLowerCase());
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="primaryColor">
            Warna utama
          </label>
          <div className="flex items-center gap-2">
            <input
              id="primaryColor"
              name="primaryColor"
              type="color"
              value={p}
              onChange={(e) => {
                setP(e.target.value);
                setPDraft(e.target.value);
              }}
              className="h-9 w-12 cursor-pointer rounded-md border border-line bg-panel2 p-0.5"
            />
            <input
              className="input mono"
              value={pDraft}
              onChange={(e) => typePrimary(e.target.value)}
              aria-label="Kode warna utama"
              placeholder="#RRGGBB"
            />
          </div>
          {!draftOk(pDraft) ? (
            <p className="hint mt-1 text-danger">Format warna harus #RRGGBB (6 digit heksa). Warna terakhir yang sah tetap dipakai.</p>
          ) : null}
        </div>
        <div>
          <label className="label" htmlFor="accentColor">
            Warna sekunder
          </label>
          <div className="flex items-center gap-2">
            <input
              id="accentColor"
              name="accentColor"
              type="color"
              value={a}
              onChange={(e) => {
                setA(e.target.value);
                setADraft(e.target.value);
              }}
              className="h-9 w-12 cursor-pointer rounded-md border border-line bg-panel2 p-0.5"
            />
            <input
              className="input mono"
              value={aDraft}
              onChange={(e) => typeAccent(e.target.value)}
              aria-label="Kode warna sekunder"
              placeholder="#RRGGBB"
            />
          </div>
          {!draftOk(aDraft) ? (
            <p className="hint mt-1 text-danger">Format warna harus #RRGGBB (6 digit heksa). Warna terakhir yang sah tetap dipakai.</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setP(preset.primary);
              setA(preset.accent);
              setPDraft(preset.primary);
              setADraft(preset.accent);
            }}
          >
            <span className="h-3 w-3 rounded-full" style={{ background: preset.primary }} />
            <span className="h-3 w-3 rounded-full" style={{ background: preset.accent }} />
            {preset.name}
          </button>
        ))}
      </div>

      <div className="panel-soft flex flex-wrap items-center gap-2 p-3">
        <span className="btn btn-primary btn-sm">Tombol utama</span>
        <span className="btn btn-accent btn-sm">Tombol sekunder</span>
        <span className="badge badge-brand">Breaking News</span>
        <span className="badge badge-accent">Siaran Nasional</span>
        <span className="hint ml-auto">Pratinjau warna (tersimpan setelah tombol simpan ditekan).</span>
      </div>
    </div>
  );
}
