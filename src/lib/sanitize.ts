import sanitizeHtmlLib from 'sanitize-html';
import { CUE_CLASS } from './broadcast-cues';

/**
 * Properti CSS yang boleh bertahan pada `<span>` — allow-list EKSPLISIT.
 *
 * PENTING (perbaikan audit Tahap 2, temuan XSS-1): sebelumnya `style` diizinkan
 * pada `<span>` TANPA batasan isi, dan sanitize-html tidak memfilter CSS. Akibatnya
 * naskah/pengumuman dapat menyimpan CSS aktif yang lolos apa adanya, mis.:
 *   <span style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#fff;z-index:99999">
 *     Login palsu
 *   </span>
 * → menutupi seluruh halaman detail berita/pengumuman (UI redressing / form login palsu),
 *   dan `background-image:url(https://luar/…)` dipakai sebagai beacon ke host pihak ketiga.
 * Sekarang hanya properti "tampilan teks" yang diizinkan; properti penentu posisi,
 * ukuran, lapisan (`position`, `top/left`, `width/height`, `z-index`), maupun yang
 * memuat URL (`background-image`, `content`, `cursor`, `filter`) DIBUANG, sehingga
 * tidak ada CSS yang dapat mengubah tata letak halaman atau memanggil jaringan.
 *
 * Batas nilai di-anchor (^…$) dan dibatasi ketat (hanya heksadesimal / rgb() / kata
 * kunci warna) supaya tidak ada celah penyisipan seperti `red;position:fixed`.
 */
const SAFE_INLINE_STYLES: { [tag: string]: { [prop: string]: RegExp[] } } = {
  span: {
    color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
    'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
    'font-weight': [/^(normal|bold|bolder|lighter|[1-9]00)$/i],
    'font-style': [/^(normal|italic|oblique)$/i],
    'font-size': [/^(xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger|\d{1,2}(\.\d+)?(px|em|rem|%))$/i],
    'text-decoration': [/^(none|underline|line-through|overline)(\s+(underline|line-through|overline))*$/i],
    'text-align': [/^(left|right|center|justify)$/i],
  },
};

/**
 * Sanitasi HTML naskah berita (allow-list). JANGAN kembali ke regex/block-list:
 * pendekatan itu terbukti bisa dilewati (mXSS, event handler tanpa tanda kutip).
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return sanitizeHtmlLib(dirty, {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'hr', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      // `style` tetap terdaftar, tetapi isinya disaring oleh allowedStyles di bawah
      // (tanpa entri di sana, sanitize-html membuang seluruh atribut style).
      span: ['style', 'class'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    // Isi atribut style dibatasi ke properti tampilan teks (lihat SAFE_INLINE_STYLES).
    allowedStyles: SAFE_INLINE_STYLES,
    // Hanya kelas chip penanda format siaran yang diizinkan; kelas lain dibuang
    // (allow-list eksplisit — jangan diganti menjadi "izinkan semua class").
    allowedClasses: {
      span: [
        CUE_CLASS,
        `${CUE_CLASS}-anchor`,
        `${CUE_CLASS}-tape`,
        `${CUE_CLASS}-vo`,
        `${CUE_CLASS}-sot`,
        `${CUE_CLASS}-standup`,
      ],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}

/** Teks polos dari HTML (untuk preview/kartu). */
export function stripHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  const clean = sanitizeHtmlLib(dirty, { allowedTags: [], allowedAttributes: {} });
  return clean.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export const excerpt = (text: string, max = 160): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
