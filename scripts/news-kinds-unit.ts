/**
 * Uji unit JENIS BERITA (tanpa browser/DB).
 *
 * Fokus: daftar jenis adalah satu sumber kebenaran, nilai yang diminta ada dengan label yang
 * benar, penyaring nilai tak dikenal aman, dan pemetaan label/badge/prioritas tidak kosong.
 * Uji ini juga menjaga agar penambahan jenis baru tidak merusak urutan/label yang lama.
 *
 *   npx tsx scripts/news-kinds-unit.ts
 */
import {
  DEFAULT_NEWS_KIND,
  KIND_LABELS,
  NEWS_KINDS,
  NEWS_KIND_VALUES,
  isNewsKind,
  kindMeta,
} from '../src/lib/news-kinds';
import { KIND_LABELS as CONSTANTS_KIND_LABELS } from '../src/lib/constants';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

// ---------- Nilai yang diminta pemilik aplikasi ----------
check('4 jenis berita terdaftar', NEWS_KINDS.length === 4, NEWS_KIND_VALUES.join(', '));
check(
  'jenis lama tetap ada (tidak ada regresi)',
  isNewsKind('REGULAR') && isNewsKind('BREAKING'),
  NEWS_KIND_VALUES.filter((v) => v === 'REGULAR' || v === 'BREAKING').join(', ')
);
check(
  'jenis "WAJIB PIMPINAN" tersedia dengan label yang diminta',
  isNewsKind('WAJIB_PIMPINAN') && KIND_LABELS.WAJIB_PIMPINAN === 'Wajib Pimpinan',
  KIND_LABELS.WAJIB_PIMPINAN
);
check(
  'jenis "SALES ORDER" tersedia dengan label yang diminta',
  isNewsKind('SALES_ORDER') && KIND_LABELS.SALES_ORDER === 'Sales Order',
  KIND_LABELS.SALES_ORDER
);

// ---------- Kelengkapan metadata (agar tidak ada jenis "setengah jadi") ----------
for (const k of NEWS_KINDS) {
  const ok =
    Boolean(k.label) &&
    Boolean(k.short) &&
    /^badge /.test(k.badge) &&
    Boolean(k.icon) &&
    Boolean(k.description) &&
    /^#[0-9a-f]{6}$/i.test(k.mapColor) &&
    ['NORMAL', 'PENTING', 'URGENT'].includes(k.priority) &&
    Boolean(k.notificationPrefix);
  check(`metadata lengkap untuk ${k.value}`, ok, `${k.label} · ${k.badge} · ${k.mapColor}`);
}
check(
  'tidak ada nilai jenis yang duplikat',
  new Set(NEWS_KIND_VALUES).size === NEWS_KINDS.length,
  `${new Set(NEWS_KIND_VALUES).size}/${NEWS_KINDS.length}`
);
check(
  'setiap jenis punya teks badge yang berbeda (mudah dibedakan)',
  new Set(NEWS_KINDS.map((k) => k.short)).size === NEWS_KINDS.length,
  NEWS_KINDS.map((k) => k.short).join(' | ')
);

// ---------- Prioritas notifikasi ----------
check(
  'Breaking News = URGENT (DANGER), Wajib Pimpinan = PENTING (WARNING)',
  kindMeta('BREAKING').priority === 'URGENT' && kindMeta('WAJIB_PIMPINAN').priority === 'PENTING',
  `${kindMeta('BREAKING').priority} / ${kindMeta('WAJIB_PIMPINAN').priority}`
);
check(
  'Berita Biasa & Sales Order = NORMAL',
  kindMeta('REGULAR').priority === 'NORMAL' && kindMeta('SALES_ORDER').priority === 'NORMAL'
);
check(
  'awalan notifikasi membedakan tiap jenis',
  new Set(NEWS_KINDS.map((k) => k.notificationPrefix)).size === NEWS_KINDS.length,
  NEWS_KINDS.map((k) => k.notificationPrefix).join(' | ')
);

// ---------- Nilai tak dikenal tidak boleh membuat halaman gagal ----------
check('isNewsKind menolak nilai tak dikenal', !isNewsKind('JENIS_ASING') && !isNewsKind('') && !isNewsKind(null) && !isNewsKind(123));
const foreign = kindMeta('JENIS_LAMA');
check(
  'kindMeta nilai tak dikenal tetap dapat dirender (label huruf mentah, badge netral)',
  foreign.label === 'JENIS_LAMA' && foreign.badge.includes('badge') && Boolean(foreign.mapColor),
  `${foreign.label} · ${foreign.badge}`
);
check('kindMeta(undefined) memakai label bawaan', kindMeta(undefined).label === 'Berita Biasa');
check('jenis bawaan = REGULAR', DEFAULT_NEWS_KIND === 'REGULAR');

// ---------- Satu sumber: constants.ts memakai label dari registry ----------
check(
  'KIND_LABELS di constants.ts identik dengan registry (tidak ada duplikasi yang menyimpang)',
  JSON.stringify(CONSTANTS_KIND_LABELS) === JSON.stringify(KIND_LABELS),
  Object.keys(CONSTANTS_KIND_LABELS).join(', ')
);

console.log(`\n${pass}/${pass + fail} pemeriksaan unit jenis berita lulus`);
if (fail) process.exit(1);
