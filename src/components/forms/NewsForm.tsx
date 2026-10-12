'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import SubmitButton from '@/components/ui/SubmitButton';
import RichTextEditor from './RichTextEditor';
import MediaUploader, { type UploadedAsset } from './MediaUploader';
import GeoPicker from './GeoPicker';
import { saveNewsAction } from '@/actions/news';
import type { ActionState } from '@/lib/validations';
import { PROVINCES } from '@/lib/provinces';
import { DEFAULT_NEWS_KIND, NEWS_KINDS, kindMeta, type NewsKindValue } from '@/lib/news-kinds';

export type NewsFormInitial = {
  id?: string;
  title: string;
  script: string;
  summary: string;
  category: string;
  kind: NewsKindValue;
  location: string;
  province: string;
  city: string;
  latitude: string;
  longitude: string;
  tags: string[];
  media: UploadedAsset[];
};

export default function NewsForm({
  categories,
  initial,
  isEdit = false,
}: {
  categories: { name: string; color: string }[];
  initial?: NewsFormInitial;
  isEdit?: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState<ActionState, FormData>(saveNewsAction, {});
  const [kind, setKind] = useState<NewsKindValue>(initial?.kind ?? DEFAULT_NEWS_KIND);
  /** Keterangan singkat jenis yang sedang dipilih (dari daftar terpusat). */
  const selectedKind = kindMeta(kind);
  const [lat, setLat] = useState(initial?.latitude ?? '');
  const [lng, setLng] = useState(initial?.longitude ?? '');
  const [notice, setNotice] = useState('');
  // true selama masih ada lampiran yang menunggu/diunggah — tombol kirim dinonaktifkan
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');

  useEffect(() => {
    if (state?.ok && state.message) {
      setNotice(state.message);
      const id = state.fieldErrors?.id;
      if (!isEdit && id) {
        router.push(`/dashboard/tabulasi/berita/${id}`);
      } else {
        router.refresh();
      }
    }
  }, [state, isEdit, router]);

  const err = (key: string) => state?.fieldErrors?.[key];

  return (
    <form
      action={action}
      onSubmit={(e) => {
        // Cegah kirim (mis. lewat tombol Enter) selama unggahan belum selesai
        if (uploading) {
          e.preventDefault();
          setNotice('Tunggu sampai semua lampiran selesai diunggah sebelum mengirim berita.');
        }
      }}
      className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]"
    >
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      {/* Kolom utama */}
      <div className="flex flex-col gap-4">
        <section className="panel shadow-soft flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className="badge badge-muted">1</span>
            <h2 className="text-[14px] font-bold">Data Utama Berita</h2>
          </div>

          <div>
            <label className="label" htmlFor="title">
              Judul Berita *
            </label>
            <input
              id="title"
              name="title"
              className="input"
              defaultValue={initial?.title ?? ''}
              placeholder="Contoh: Presiden Resmikan Tol Trans Sumatera Ruas Medan–Tebing Tinggi"
              maxLength={240}
            />
            {err('title') ? <p className="mt-1 text-[11.5px] text-danger">{err('title')}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category">
                Kategori *
              </label>
              <select id="category" name="category" className="select" defaultValue={initial?.category ?? ''}>
                <option value="">Pilih kategori…</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              {err('category') ? <p className="mt-1 text-[11.5px] text-danger">{err('category')}</p> : null}
            </div>
            <div>
              <span className="label">Jenis Berita *</span>
              <input type="hidden" name="kind" value={kind} />
              <div className="grid grid-cols-2 gap-1.5">
                {NEWS_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={`btn justify-center ${kind === k.value ? 'btn-primary' : ''}`}
                    data-kind-option={k.value}
                  >
                    <Icon name={k.icon} size={13} /> {k.label}
                  </button>
                ))}
              </div>
              {selectedKind.description ? (
                <p
                  className={`hint mt-1 ${selectedKind.priority === 'URGENT' ? 'text-[color:var(--warn)]' : ''}`}
                  data-kind-hint
                >
                  {selectedKind.description}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="summary">
              Ringkasan / Lead (opsional)
            </label>
            <textarea
              id="summary"
              name="summary"
              className="textarea"
              rows={2}
              maxLength={400}
              defaultValue={initial?.summary ?? ''}
              placeholder="Dua kalimat inti berita untuk tampilan tabulasi."
            />
          </div>
        </section>

        <section className="panel shadow-soft flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className="badge badge-muted">2</span>
            <h2 className="text-[14px] font-bold">Naskah Berita *</h2>
            <span className="hint ml-auto hidden sm:block">Tulis lengkap dengan 5W1H, kutipan narasumber, dan keterangan footage.</span>
          </div>
          <RichTextEditor name="script" initialHtml={initial?.script ?? ''} />
          {err('script') ? <p className="text-[11.5px] text-danger">{err('script')}</p> : null}
        </section>

        <section className="panel shadow-soft flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className="badge badge-muted">3</span>
            <h2 className="text-[14px] font-bold">Footage &amp; Gambar</h2>
            <span className="hint ml-auto hidden sm:block">
              Boleh lebih dari satu berkas — unggahan berjalan dengan indikator progres.
            </span>
          </div>
          <MediaUploader
            name="media"
            initial={initial?.media ?? []}
            onNotice={setNotice}
            onBusyChange={setUploading}
          />
        </section>
      </div>

      {/* Kolom samping */}
      <div className="flex flex-col gap-4">
        <section className="panel shadow-soft flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Icon name="pin" size={14} className="text-muted" />
            <h2 className="text-[14px] font-bold">Lokasi &amp; Geo-Tagging</h2>
          </div>

          <div>
            <label className="label" htmlFor="location">
              Nama Lokasi Liputan *
            </label>
            <input
              id="location"
              name="location"
              className="input"
              defaultValue={initial?.location ?? ''}
              placeholder="Contoh: Pasar Induk Caringin, Bandung"
            />
            {err('location') ? <p className="mt-1 text-[11.5px] text-danger">{err('location')}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="province">
                Provinsi
              </label>
              <select id="province" name="province" className="select" defaultValue={initial?.province ?? ''}>
                <option value="">Pilih provinsi…</option>
                {PROVINCES.map((pv) => (
                  <option key={pv} value={pv}>
                    {pv}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="city">
                Kota/Kabupaten
              </label>
              <input id="city" name="city" className="input" defaultValue={initial?.city ?? ''} placeholder="Bandung" />
            </div>
          </div>

          <GeoPicker latitude={lat} longitude={lng} onChange={(a, b) => { setLat(a); setLng(b); }} />
        </section>

        <section className="panel shadow-soft flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Icon name="tag" size={14} className="text-muted" />
            <h2 className="text-[14px] font-bold">Tag</h2>
          </div>
          <input
            name="tags"
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tol, infrastruktur, sumatera"
          />
          <p className="hint">Pisahkan dengan koma. Maksimal 12 tag.</p>
          <div className="flex flex-wrap gap-1">
            {tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 12)
              .map((t) => (
                <span key={t} className="badge badge-muted">
                  #{t}
                </span>
              ))}
          </div>
        </section>

        <section className="panel shadow-soft sticky top-16 flex flex-col gap-2 p-4">
          <h2 className="text-[14px] font-bold">Kirim</h2>
          <p className="hint">
            “Simpan Draft” menyimpan tanpa mengirim. “Kirim Berita” mengubah status menjadi Menunggu Persetujuan.
          </p>

          {state?.error ? (
            <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
              <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
              <span>{state.error}</span>
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
              {notice}
            </p>
          ) : null}

          {uploading ? (
            <p className="rounded-lg border border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-[12px] text-accent">
              Lampiran sedang diunggah — tombol kirim aktif kembali setelah selesai.
            </p>
          ) : null}

          <button type="submit" name="submit" value="draft" className="btn w-full" disabled={uploading}>
            <Icon name="file" size={14} /> Simpan Draft
          </button>
          <SubmitButton className="btn btn-primary w-full" pendingText="Mengirim ke newsroom…" disabled={uploading}>
            <Icon name="send" size={14} /> Kirim Berita
          </SubmitButton>
          <Link href="/dashboard/tabulasi?tab=saya" className="btn w-full">
            Batal
          </Link>
        </section>
      </div>
    </form>
  );
}
