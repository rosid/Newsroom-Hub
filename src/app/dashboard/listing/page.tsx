import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getListingByBureau, getFilterOptions } from '@/lib/news';
import { canViewListing } from '@/lib/permissions';
import { parseDateRange, RANGE_OPTIONS, toDateInputValue } from '@/lib/utils';
import { NEWS_KINDS } from '@/lib/news-kinds';
import { p } from '@/lib/base';
import BureauListingGroup, { type ListingRow } from '@/components/news/BureauListingGroup';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Listing Berita' };

/**
 * LISTING BERITA — daftar berita dari biro yang DIDORONG KE PUSAT, dikelompokkan per biro
 * (tabel bisa dilipat). Kolom: No. Berita | Judul | Jenis | Kategori | Sumber | Waktu Kirim | Buka.
 *
 * Akses: semua role KECUALI Reporter Daerah, Reporter Pusat, Kontributor, dan Magang
 * (lihat `canViewListing`). Penegakan ada di SERVER, bukan hanya menu disembunyikan.
 *
 * Cakupan data mengikuti aturan pool yang berlaku (`newsVisibilityWhere`) — lihat
 * `getListingByBureau` di lib/news.ts. Jadi Produser Daerah hanya melihat biro sendiri +
 * berita biro lain yang sudah Terverifikasi/Disiarkan, sedangkan role pusat & admin
 * melihat seluruh biro.
 */
export default async function ListingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  if (!canViewListing(user)) {
    return (
      <div className="panel shadow-soft mx-auto max-w-lg p-6 text-center">
        <Icon name="lock" size={22} className="mx-auto text-muted" />
        <h1 className="mt-2 text-[16px] font-bold">Akses ditolak</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Halaman Listing Berita hanya dapat dibuka oleh Produser, Koordinator, Redaktur, dan Admin.
          Reporter, Kontributor, serta Magang menggunakan halaman Tabulasi Berita.
        </p>
        <Link href="/dashboard/tabulasi" className="btn btn-primary mt-4">
          Buka Tabulasi Berita
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = (one(sp.q) ?? '').trim();
  const rangeKey = one(sp.range) ?? '30d';
  const fromInput = one(sp.from) ?? '';
  const toInput = one(sp.to) ?? '';

  const range = parseDateRange({ range: rangeKey, from: fromInput, to: toInput });
  const [data, options] = await Promise.all([
    getListingByBureau(user, { q: q || undefined, category: one(sp.category) || undefined, kind: one(sp.kind) || undefined, range }),
    getFilterOptions(),
  ]);

  const rowsOf = (items: { id: string; code: string; title: string; kind: string; category: string; status: string; createdAt: Date; author: { name: string } }[]): ListingRow[] =>
    items.map((n) => ({
      id: n.id,
      code: n.code,
      title: n.title,
      kind: String(n.kind),
      category: n.category,
      status: String(n.status),
      // "Sumber" = nama reporter (penulis naskah), sesuai permintaan.
      source: n.author?.name ?? '-',
      createdAt: n.createdAt.toISOString(),
    }));

  const activeRange = RANGE_OPTIONS.find((r) => r.key === rangeKey);
  const periodLabel = rangeKey === 'all' ? 'seluruh data' : `${range.fromStr} – ${range.toStr}`;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Listing Berita</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Berita dari biro yang <strong>didorong ke pusat</strong>, dikelompokkan per biro.
            Menampilkan {data.total} berita · periode {periodLabel}.
          </p>
        </div>
        <span className="badge badge-warn">
          <Icon name="push" size={12} /> Didorong ke Pusat
        </span>
      </header>

      {/* ---------- Pencarian + filter tanggal ---------- */}
      <div className="panel shadow-soft p-3">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-2.5">
          {RANGE_OPTIONS.filter((r) => r.key !== 'all').map((r) => (
            <Link
              key={r.key}
              href={`/dashboard/listing?range=${r.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`tab ${rangeKey === r.key ? 'active' : ''}`}
              data-range-preset={r.key}
            >
              {r.label}
            </Link>
          ))}
          {rangeKey === 'all' ? <span className="tab active">Semua</span> : null}
        </div>

        <form action={p('/dashboard/listing')} method="get" className="mt-2.5 grid grid-cols-2 gap-2 md:grid-cols-12">
          <input type="hidden" name="range" value={rangeKey === 'all' ? '' : rangeKey} />
          <div className="col-span-2 md:col-span-5">
            <label className="label" htmlFor="l-q">
              Cari
            </label>
            <input
              id="l-q"
              name="q"
              className="input"
              placeholder="Judul, nomor berita, lokasi, atau nama reporter…"
              defaultValue={q}
              data-listing-search
            />
          </div>
          <div className="md:col-span-3">
            <label className="label" htmlFor="l-category">
              Kategori
            </label>
            <select id="l-category" name="category" className="select" defaultValue={one(sp.category) ?? ''}>
              <option value="">Semua kategori</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="l-kind">
              Jenis
            </label>
            <select id="l-kind" name="kind" className="select" defaultValue={one(sp.kind) ?? ''}>
              <option value="">Semua jenis</option>
              {NEWS_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 md:col-span-2">
            <label className="label">Aksi</label>
            <div className="flex gap-1.5">
              <button type="submit" className="btn btn-primary btn-sm flex-1 justify-center">
                <Icon name="search" size={13} /> Cari
              </button>
              <Link href="/dashboard/listing" className="btn btn-sm">
                Reset
              </Link>
            </div>
          </div>

          {/* Rentang kustom */}
          <div className="col-span-2 mt-1 rounded-lg border border-line bg-panel2 p-2.5 md:col-span-12">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Rentang kustom</p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="label" htmlFor="l-from">
                  Dari tanggal
                </label>
                <input
                  id="l-from"
                  name="from"
                  type="date"
                  className="input"
                  defaultValue={fromInput || toDateInputValue(range.from)}
                  data-listing-from
                />
              </div>
              <div>
                <label className="label" htmlFor="l-to">
                  Sampai tanggal
                </label>
                <input
                  id="l-to"
                  name="to"
                  type="date"
                  className="input"
                  defaultValue={toInput || toDateInputValue(range.to)}
                  data-listing-to
                />
              </div>
              <button type="submit" name="range" value="custom" className="btn btn-sm" data-listing-custom>
                Terapkan rentang
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ---------- Tabel per biro (bisa dilipat) ---------- */}
      {data.groups.length ? (
        <div className="flex flex-col gap-4">
          {data.groups.map((g) => (
            <BureauListingGroup
              key={g.bureauId}
              bureauName={g.bureauName}
              bureauCode={g.bureauCode}
              rows={rowsOf(g.items)}
            />
          ))}
        </div>
      ) : (
        <section className="panel shadow-soft p-10 text-center" data-listing-empty>
          <Icon name="push" size={22} className="mx-auto text-muted" />
          <h2 className="mt-2 text-[15px] font-bold">Belum ada berita yang didorong ke pusat</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            {q || one(sp.category) || one(sp.kind)
              ? 'Coba ubah kata kunci atau filter yang dipakai.'
              : `Tidak ada berita biro yang didorong ke pusat pada periode ${activeRange?.label ?? rangeKey}.`}
          </p>
        </section>
      )}
    </div>
  );
}
