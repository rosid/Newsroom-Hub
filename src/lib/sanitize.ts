import sanitizeHtmlLib from 'sanitize-html';
import { CUE_CLASS } from './broadcast-cues';

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
      span: ['style', 'class'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
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
