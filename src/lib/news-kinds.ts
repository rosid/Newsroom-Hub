/**
 * JENIS BERITA — SATU SUMBER KEBENARAN.
 *
 * Sebelumnya jenis berita ditulis ulang sebagai `'REGULAR' | 'BREAKING'` di ~15 berkas
 * (form, filter, badge, peta, notifikasi, ekspor). Menambah jenis baru dengan pola itu
 * berarti harus menemukan dan mengubah setiap salinannya — dan satu yang terlewat membuat
 * jenis baru tampil tanpa label/badge.
 *
 * Cara menambah jenis berita baru (hanya perlu 2 langkah):
 *   1. tambahkan nilainya di `enum NewsKind` (prisma/schema.prisma), dan
 *   2. tambahkan satu entri di `NEWS_KINDS` di bawah.
 * Form, filter, badge, peta, ringkasan ekspor, dan notifikasi ikut otomatis. Bila langkah 1
 * dikerjakan tetapi langkah 2 terlewat, **type-check akan gagal** (lihat penjaga di
 * `constants.ts`), jadi jenis baru tidak mungkin tampil tanpa label.
 *
 * Modul ini CLIENT-SAFE: jangan menambahkan `import` nilai runtime dari `@prisma/client`,
 * `prisma`, atau modul server lain (ikut ke bundle browser).
 */

export type NewsKindMeta = {
  /** Nilai yang disimpan di kolom `News.kind` (harus sama dengan enum `NewsKind`). */
  value: string;
  /** Nama lengkap (form, filter, ekspor). */
  label: string;
  /** Teks pendek untuk badge (huruf besar, ringkas). */
  short: string;
  /** Kelas badge yang sudah ada di globals.css. */
  badge: string;
  /** Nama ikon di components/ui/Icon.tsx. */
  icon: string;
  /** Keterangan singkat di bawah tombol pemilih jenis. */
  description: string;
  /** Warna pin pada peta sebaran. */
  mapColor: string;
  /** Tanda singkat di dalam pin ('' = polos). */
  pinMark: string;
  /** Prioritas notifikasi saat berita dikirim: NORMAL=INFO, PENTING=WARNING, URGENT=DANGER. */
  priority: 'NORMAL' | 'PENTING' | 'URGENT';
  /** Awalan judul notifikasi (biar penerima tahu jenisnya sekilas). */
  notificationPrefix: string;
};

/**
 * Daftar jenis berita. `as const satisfies` dipakai supaya setiap `value` tetap berupa
 * literal (sehingga `NewsKindValue` di bawah benar-benar sempit) sekaligus tetap diperiksa
 * terhadap bentuk `NewsKindMeta`.
 */
export const NEWS_KINDS = [
  {
    value: 'REGULAR',
    label: 'Berita Biasa',
    short: 'BIASA',
    badge: 'badge badge-muted',
    icon: 'file',
    description: 'Berita harian seperti biasa.',
    mapColor: '#64748b',
    pinMark: '',
    priority: 'NORMAL',
    notificationPrefix: 'Kiriman berita',
  },
  {
    value: 'BREAKING',
    label: 'Breaking News',
    short: 'BREAKING',
    badge: 'badge badge-danger',
    icon: 'flame',
    description: 'Breaking news langsung memicu notifikasi ke redaktur & produser.',
    mapColor: '#e8384a',
    pinMark: '!',
    priority: 'URGENT',
    notificationPrefix: 'Breaking News',
  },
  {
    value: 'WAJIB_PIMPINAN',
    label: 'Wajib Pimpinan',
    short: 'WAJIB PIMPINAN',
    badge: 'badge badge-warn',
    icon: 'shield',
    description: 'Naskah wajib untuk pimpinan — ditandai sebagai prioritas bagi redaktur & produser.',
    mapColor: '#f97316',
    pinMark: 'P',
    priority: 'PENTING',
    notificationPrefix: 'Wajib Pimpinan',
  },
  {
    value: 'SALES_ORDER',
    label: 'Sales Order',
    short: 'SALES ORDER',
    badge: 'badge badge-accent',
    icon: 'tag',
    description: 'Materi pesanan/kerja sama komersial (sales order).',
    mapColor: '#0d9488',
    pinMark: 'S',
    priority: 'NORMAL',
    notificationPrefix: 'Sales Order',
  },
] as const satisfies readonly NewsKindMeta[];

/** Union nilai jenis berita — diturunkan dari daftar di atas, tidak ditulis manual. */
export type NewsKindValue = (typeof NEWS_KINDS)[number]['value'];

/** Daftar nilai saja (validasi zod & query filter). */
export const NEWS_KIND_VALUES: NewsKindValue[] = NEWS_KINDS.map((k) => k.value);

/** Jenis bawaan bila tidak dipilih. */
export const DEFAULT_NEWS_KIND: NewsKindValue = 'REGULAR';

const BY_VALUE = new Map<string, NewsKindMeta>(NEWS_KINDS.map((k) => [k.value as string, k as NewsKindMeta]));

/**
 * Metadata satu jenis. Nilai tak dikenal (mis. data lama) tetap menghasilkan objek yang
 * bisa dirender — memakai label huruf mentahnya — supaya halaman tidak pernah gagal hanya
 * karena ada nilai di luar daftar.
 */
export function kindMeta(value: string | null | undefined): NewsKindMeta {
  const found = BY_VALUE.get(String(value ?? ''));
  if (found) return found;
  const raw = String(value ?? '').trim();
  return {
    value: raw || DEFAULT_NEWS_KIND,
    label: raw || 'Berita Biasa',
    short: (raw || 'BIASA').toUpperCase(),
    badge: 'badge badge-muted',
    icon: 'file',
    description: '',
    mapColor: '#64748b',
    pinMark: '',
    priority: 'NORMAL',
    notificationPrefix: 'Kiriman berita',
  };
}

/** Apakah nilai ini jenis berita yang dikenal? (validasi input) */
export const isNewsKind = (value: unknown): value is NewsKindValue =>
  typeof value === 'string' && BY_VALUE.has(value);

/** Label lengkap per jenis (dipakai seperti `KIND_LABELS[x]`). */
export const KIND_LABELS = Object.fromEntries(
  NEWS_KINDS.map((k) => [k.value, k.label])
) as Record<NewsKindValue, string>;

/** Teks badge pendek untuk tabel/kartu. */
export const KIND_SHORT = Object.fromEntries(
  NEWS_KINDS.map((k) => [k.value, k.short])
) as Record<NewsKindValue, string>;
