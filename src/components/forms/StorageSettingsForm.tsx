'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveStorageSettingsAction, testStorageAction, resetStorageAction } from '@/actions/settings';
import { STORAGE_PROVIDERS, providerPreset } from '@/lib/storage-providers';
import SubmitButton from '@/components/ui/SubmitButton';
import Icon from '@/components/ui/Icon';
import type { ActionState } from '@/lib/validations';

export type StorageFormValues = {
  mode: 'local' | 's3';
  provider: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  /** Kosong = jangan ubah kredensial yang tersimpan. */
  hasSecret: boolean;
  publicBaseUrl: string;
  prefix: string;
  forcePathStyle: boolean;
};

export default function StorageSettingsForm({ initial }: { initial: StorageFormValues }) {
  const router = useRouter();
  const [saveState, saveAction] = useActionState<ActionState, FormData>(saveStorageSettingsAction, {});
  const [testState, testFormAction] = useActionState<ActionState, FormData>(testStorageAction, {});
  const [resetState, resetAction] = useActionState<ActionState, FormData>(resetStorageAction, {});

  const [mode, setMode] = useState<'local' | 's3'>(initial.mode);
  const [provider, setProvider] = useState(initial.provider === 'local' ? 'bunny' : initial.provider);
  const [endpoint, setEndpoint] = useState(initial.endpoint);
  const [region, setRegion] = useState(initial.region);
  const [bucket, setBucket] = useState(initial.bucket);
  const [publicBaseUrl, setPublicBaseUrl] = useState(initial.publicBaseUrl);
  const [accessKeyId, setAccessKeyId] = useState(initial.accessKeyId);
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [prefix, setPrefix] = useState(initial.prefix || 'newsroom');
  const [forcePathStyle, setForcePathStyle] = useState(initial.forcePathStyle);
  const [secretTouched, setSecretTouched] = useState(false);

  const preset = useMemo(() => providerPreset(provider), [provider]);

  useEffect(() => {
    if (saveState?.ok) router.refresh();
  }, [saveState, router]);

  useEffect(() => {
    if (resetState?.ok) {
      setMode('local');
      router.refresh();
    }
  }, [resetState, router]);

  const applyPreset = (key: string) => {
    const p = providerPreset(key);
    setProvider(key);
    setEndpoint(p.endpoint);
    setRegion(p.region);
    setForcePathStyle(p.forcePathStyle);
  };

  const activeState = saveState?.ok ? saveState : saveState?.error ? saveState : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Pemilih mode */}
      <div className="panel shadow-soft p-4">
        <h2 className="mb-1 flex items-center gap-2 text-[14px] font-bold">
          <Icon name="cloud" size={15} className="text-muted" /> Mode Penyimpanan Footage &amp; Gambar
        </h2>
        <p className="mb-3 text-[12px] text-muted">
          Pilih penyimpanan lokal di server, atau penyedia <strong>S3-compatible</strong> (BunnyCDN, Cloudflare R2, Amazon
          S3, DigitalOcean Spaces, Wasabi, Backblaze B2, MinIO, dsb.).
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode('local')}
            className={`panel-soft flex items-start gap-3 p-3 text-left ${mode === 'local' ? 'ring-2 ring-[color:var(--accent)]' : ''}`}
          >
            <Icon name="file" size={16} className="mt-0.5 text-muted" />
            <span>
              <span className="block text-[13px] font-bold">Penyimpanan Lokal (server)</span>
              <span className="block text-[11.5px] text-muted">
                Berkas di folder <span className="mono">uploads/</span> — paling cepat disiapkan, tetapi memakai disk VPS.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode('s3')}
            className={`panel-soft flex items-start gap-3 p-3 text-left ${mode === 's3' ? 'ring-2 ring-[color:var(--accent)]' : ''}`}
          >
            <Icon name="cloud" size={16} className="mt-0.5 text-muted" />
            <span>
              <span className="block text-[13px] font-bold">S3 Compatible (Cloud / CDN)</span>
              <span className="block text-[11.5px] text-muted">
                Footage dikirim langsung ke storage cloud &amp; disajikan lewat CDN — disarankan untuk produksi.
              </span>
            </span>
          </button>
        </div>
      </div>

      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="provider" value={provider} />

        {mode === 's3' ? (
          <div className="panel shadow-soft p-4">
            <h3 className="mb-3 text-[14px] font-bold">Konfigurasi S3 Compatible</h3>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {STORAGE_PROVIDERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  className={`btn btn-sm ${provider === p.key ? 'btn-accent' : ''}`}
                >
                  {p.key === 'bunny' ? <Icon name="flame" size={12} /> : null}
                  {p.label.split(' (')[0]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="s-endpoint">
                  Endpoint S3 {provider !== 'aws' ? '*' : '(opsional untuk Amazon S3)'}
                </label>
                <input
                  id="s-endpoint"
                  name="endpoint"
                  className="input mono"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://sg.storage.bunnycdn.com"
                />
                <p className="hint">{preset.key === 'bunny' ? 'Ganti kode region (sg/ny/de/…) sesuai zone Anda.' : 'Alamat server S3 penyedia Anda.'}</p>
              </div>

              <div>
                <label className="label" htmlFor="s-region">
                  Region
                </label>
                <input
                  id="s-region"
                  name="region"
                  className="input mono"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="de"
                />
              </div>

              <div>
                <label className="label" htmlFor="s-prefix">
                  Folder di dalam bucket
                </label>
                <input
                  id="s-prefix"
                  name="prefix"
                  className="input mono"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="newsroom"
                />
              </div>

              <div>
                <label className="label" htmlFor="s-bucket">
                  {preset.bucketLabel} *
                </label>
                <input
                  id="s-bucket"
                  name="bucket"
                  className="input mono"
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  placeholder={preset.key === 'bunny' ? 'nama-storage-zone' : 'nama-bucket'}
                />
              </div>

              <div>
                <label className="label" htmlFor="s-access">
                  {preset.accessKeyLabel} *
                </label>
                <input
                  id="s-access"
                  name="accessKeyId"
                  className="input mono"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder={preset.key === 'bunny' ? 'nama-storage-zone' : 'AKIA…'}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="label" htmlFor="s-secret">
                  Secret Access Key {initial.hasSecret ? '(biarkan kosong bila tidak diubah)' : '*'}
                </label>
                <input
                  id="s-secret"
                  name="secretAccessKey"
                  type="password"
                  autoComplete="new-password"
                  className="input mono"
                  value={secretAccessKey}
                  placeholder={initial.hasSecret ? '•••••••• (sudah tersimpan, terenkripsi)' : 'isi secret access key'}
                  onChange={(e) => {
                    setSecretAccessKey(e.target.value);
                    setSecretTouched(true);
                  }}
                />
                <p className="hint">
                  Kredensial disimpan <strong>terenkripsi</strong> di database dan hanya dibaca oleh server.
                  {initial.hasSecret ? ' Kosongkan bila tidak ingin mengubah.' : ''}
                </p>
                {initial.hasSecret ? (
                  <label className="mt-1 flex items-center gap-2 text-[11.5px] text-muted">
                    <input type="checkbox" name="clearSecret" value="on" />
                    Hapus kredensial tersimpan (isi ulang dari awal)
                  </label>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <label className="label" htmlFor="s-public">
                  {preset.publicUrlLabel}
                </label>
                <input
                  id="s-public"
                  name="publicBaseUrl"
                  className="input mono"
                  value={publicBaseUrl}
                  onChange={(e) => setPublicBaseUrl(e.target.value)}
                  placeholder={preset.publicUrlPlaceholder}
                />
                <p className="hint">
                  Harus HTTPS agar gambar/footage dapat ditampilkan di browser. Bila dikosongkan, berkas dilayani lewat
                  server (lebih lambat untuk footage besar).
                </p>
              </div>

              <label className="flex items-center gap-2 text-[12.5px] sm:col-span-2">
                <input
                  type="checkbox"
                  name="forcePathStyle"
                  value="on"
                  checked={forcePathStyle}
                  onChange={(e) => setForcePathStyle(e.target.checked)}
                />
                Gunakan path-style addressing (wajib untuk BunnyCDN, MinIO, Wasabi, R2, B2)
              </label>
            </div>

            <ul className="mt-3 flex flex-col gap-1 rounded-lg border border-line bg-panel2 p-3 text-[11.5px] text-muted">
              {preset.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Umpan balik aksi */}
        {activeState?.error ? (
          <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
            <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
            <span>{activeState.error}</span>
          </p>
        ) : null}
        {activeState?.ok ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
            {activeState.message}
          </p>
        ) : null}
        {testState?.ok ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
            {testState.message}
          </p>
        ) : null}
        {testState?.error ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
            {testState.error}
          </p>
        ) : null}
        {resetState?.ok ? (
          <p className="rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-muted">{resetState.message}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn btn-primary" pendingText="Memproses…">
            <Icon name="check" size={14} /> Simpan Konfigurasi Storage
          </SubmitButton>
          <button type="submit" formAction={testFormAction} className="btn">
            <Icon name="refresh" size={14} /> Jalankan Uji Koneksi
          </button>
          <span className="hint">
            {initial.hasSecret
              ? 'Secret yang tersimpan dipakai ulang bila kolom secret dibiarkan kosong.'
              : 'Uji koneksi menulis, membaca, lalu menghapus satu objek uji tanpa menyimpan konfigurasi.'}
          </span>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
      {initial.mode !== 'local' ? (
        <form action={resetAction}>
          <SubmitButton className="btn btn-danger" pendingText="Mengalihkan…">
            <Icon name="back" size={14} /> Kembalikan ke Penyimpanan Lokal
          </SubmitButton>
        </form>
      ) : null}
      </div>
    </div>
  );
}
