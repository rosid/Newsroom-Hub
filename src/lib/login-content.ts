/**
 * Konten halaman login (frontpage) yang dapat diubah pengelola.
 *
 * Modul ini SENGAJA bebas dari prisma/next/server agar aman diimpor komponen client
 * (form pengaturan) maupun server (halaman login). Nilai disimpan pada Setting `login`
 * sebagai JSON — tidak perlu migrasi database.
 *
 * PENTING: jangan menambahkan impor ke `settings.ts`/`constants.ts` dari sini. Modul ini
 * ikut ke bundle BROWSER; menarik modul server akan merusak hidrasi (pola yang sudah
 * pernah menimbulkan masalah di proyek ini).
 */

export type LoginSettings = {
  /** Teks kecil di atas judul panel branding, mis. "Newsroom Control Desk". */
  heroBadge: string;
  /**
   * Judul besar panel branding.
   *
   * Mendukung penanda warna sederhana supaya desain dua warna tetap bisa dipertahankan
   * tanpa perlu banyak kolom terpisah:
   *   [[teks]]  → warna utama (brand)
   *   {{teks}}  → warna aksen (accent)
   * Teks tanpa penanda dirender apa adanya.
   */
  heroTitle: string;
  /** Poin-poin penjelasan pada panel branding — satu poin per baris. */
  heroPoints: string;
  /** Catatan kaki kiri panel branding, mis. versi & domain. */
  heroFooterNote: string;
  /** Catatan kaki kanan panel branding. */
  heroFooterRights: string;
  /** Judul di atas form login, mis. "Masuk ke ruang redaksi". */
  formTitle: string;
  /** Kalimat penjelas di bawah judul form login. */
  formSubtitle: string;
  /**
   * URL PUBLIK gambar latar panel branding (opsional).
   *
   * WAJIB berupa URL yang dapat dibuka tanpa login (mis. domain CDN/pull zone).
   * Halaman login bersifat publik, sedangkan `/api/media/...` memerlukan sesi —
   * jadi nilai seperti "local:…" atau "s3:…" TIDAK akan tampil untuk pengunjung.
   */
  heroImageUrl: string;
  /** Kepekatan lapisan gelap di atas gambar (0–100). Menjaga teks tetap terbaca. */
  heroImageOpacity: number;
  /**
   * Warna latar halaman login (opsional, format #RRGGBB).
   *
   * Terpisah dari tema gelap/terang: bila diisi, warna ini dipakai sebagai dasar latar
   * halaman login dan tema (gelap/terang) hanya menentukan warna teks. Kosongkan untuk
   * mengikuti latar tema bawaan (perilaku lama).
   */
  pageBgColor: string;
  /** Teks hak cipta di bawah form login (opsional). */
  formCopyright: string;
};

export const DEFAULT_LOGIN: LoginSettings = {
  heroBadge: 'Newsroom Control Desk',
  heroTitle: 'Satu pintu pengiriman berita [[Pusat]] & {{Biro Daerah}}.',
  heroPoints: [
    'Kirim naskah + footage dari lapangan, langsung dari ponsel reporter',
    'Pemisahan tegas Tabung Pusat & Biro Daerah, dorong berita daerah ke siaran nasional',
    'Peta sebaran berita, statistik harian, dan laporan per biro',
  ].join('\n'),
  heroFooterNote: 'v1.0 · newsroom.garuda.tv',
  heroFooterRights: 'Hak akses berjenjang 9 level pengguna',
  formTitle: 'Masuk ke ruang redaksi',
  formSubtitle: 'Gunakan email redaksi yang terdaftar. Hubungi admin bila akses terkendala.',
  heroImageUrl: '',
  heroImageOpacity: 55,
  pageBgColor: '',
  formCopyright: '',
};

/** Batas jumlah poin agar tata letak panel tidak rusak. */
export const MAX_HERO_POINTS = 6;
/** Batas panjang teks hak cipta. */
export const MAX_FORM_COPYRIGHT = 160;
/** Batas panjang tiap poin. */
export const MAX_HERO_POINT_LENGTH = 160;
/** Batas panjang judul besar. */
export const MAX_HERO_TITLE_LENGTH = 180;

/**
 * Pecah judul menjadi potongan bertona agar `[[…]]` (brand) dan `{{…}}` (accent)
 * dapat dirender sebagai warna berbeda TANPA `dangerouslySetInnerHTML`.
 *
 * Fungsi murni & tanpa efek samping — dipakai halaman login (server) dan diuji unit.
 * Penanda yang tidak lengkap cukup dibiarkan sebagai teks biasa (tidak melempar galat),
 * supaya salah ketik kecil tidak membuat halaman login gagal tampil.
 */
export type HeroTitlePart = { text: string; tone?: 'brand' | 'accent' };

export function parseHeroTitle(input: string | null | undefined): HeroTitlePart[] {
  const raw = String(input ?? '');
  if (!raw.trim()) return [];

  const out: HeroTitlePart[] = [];
  // Satu regex untuk kedua penanda; teks di antaranya dikumpulkan sebagai potongan polos.
  const re = /\[\[([^\]]+)\]\]|\{\{([^}]+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      const plain = raw.slice(last, m.index);
      if (plain) out.push({ text: plain });
    }
    if (m[1] !== undefined) out.push({ text: m[1], tone: 'brand' });
    else if (m[2] !== undefined) out.push({ text: m[2], tone: 'accent' });
    last = m.index + m[0].length;
  }
  if (last < raw.length) {
    const tail = raw.slice(last);
    if (tail) out.push({ text: tail });
  }

  // Penanda sisa yang tidak lengkap (mis. "[[" tanpa penutup) dibiarkan sebagai teks polos
  // agar tidak hilang dari tampilan.
  return out.length ? out : [{ text: raw }];
}

/** Poin-poin penjelasan: satu per baris, kosong dibuang, jumlah & panjang dibatasi. */
export function parseHeroPoints(input: string | null | undefined): string[] {
  return String(input ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_HERO_POINTS)
    .map((s) => s.slice(0, MAX_HERO_POINT_LENGTH));
}

/**
 * Apakah URL gambar dapat dipakai di halaman PUBLIK?
 * Hanya URL http(s) — nilai `local:`/`s3:` hanya bisa dilayani `/api/media/...`
 * yang mewajibkan sesi login, sehingga tidak akan tampil bagi pengunjung.
 */
export const isPublicImageUrl = (url: string | null | undefined): boolean =>
  /^https?:\/\//i.test(String(url ?? '').trim());

/** Warna heksadesimal #RRGGBB yang valid. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Apakah nilai ini warna #RRGGBB yang valid? (dipakai form & validasi server) */
export const isHexColor = (v: string | null | undefined): boolean => HEX_COLOR.test(String(v ?? '').trim());

/**
 * Nilai CSS `background` untuk halaman login.
 *
 * Bila warna latar diatur, dipakai gradasi halus dari warna itu (lebih terang sedikit di atas,
 * lebih gelap di bawah) agar halaman tidak terlihat datar. Bila kosong → string kosong, dan
 * halaman login memakai latar tema bawaan (perilaku lama, tidak berubah).
 *
 * Hasilnya HANYA memuat warna heksadesimal tervalidasi (tidak ada masukan bebas masuk ke CSS).
 */
export function loginPageBackground(color: string | null | undefined): string {
  const c = String(color ?? '').trim();
  if (!HEX_COLOR.test(c)) return '';
  return `linear-gradient(180deg, color-mix(in srgb, ${c} 88%, #fff), color-mix(in srgb, ${c} 82%, #000))`;
}

/** Label huruf tunggal dari nama situs — dipakai bila logo belum diunggah. */
export function siteInitial(siteName: string | null | undefined): string {
  const name = String(siteName ?? '').trim();
  return name ? name.charAt(0).toUpperCase() : 'G';
}
