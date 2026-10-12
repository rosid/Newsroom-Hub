/**
 * Uji unit konten halaman login (tanpa browser/DB):
 * parser judul dua warna, pemecah poin, deteksi URL publik, dan schema validasinya.
 *
 *   npx tsx scripts/login-settings-unit.ts
 */
import {
  DEFAULT_LOGIN,
  MAX_HERO_POINTS,
  isPublicImageUrl,
  parseHeroPoints,
  parseHeroTitle,
  siteInitial,
} from '../src/lib/login-content';
import { loginSettingsSchema } from '../src/lib/validations';

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

// ---------- parseHeroTitle ----------
const t1 = parseHeroTitle('Satu pintu pengiriman berita [[Pusat]] & {{Biro Daerah}}.');
check(
  'penanda [[…]] menjadi potongan bertona brand',
  t1.filter((p) => p.tone === 'brand').length === 1 && t1.find((p) => p.tone === 'brand')?.text === 'Pusat',
  JSON.stringify(t1)
);
check(
  'penanda {{…}} menjadi potongan bertona accent',
  t1.filter((p) => p.tone === 'accent').length === 1 && t1.find((p) => p.tone === 'accent')?.text === 'Biro Daerah',
  JSON.stringify(t1)
);
check(
  'teks di sekitar penanda tetap utuh & urut',
  t1.map((p) => p.text).join('') === 'Satu pintu pengiriman berita Pusat & Biro Daerah.',
  t1.map((p) => p.text).join('|')
);
check('judul tanpa penanda dirender polos', parseHeroTitle('Judul biasa').length === 1 && !parseHeroTitle('Judul biasa')[0].tone);
check('judul kosong menghasilkan daftar kosong', parseHeroTitle('').length === 0 && parseHeroTitle(null).length === 0);
check(
  'penanda tidak lengkap dibiarkan sebagai teks (tidak hilang / tidak error)',
  parseHeroTitle('Awal [[tanpa penutup').map((p) => p.text).join('') === 'Awal [[tanpa penutup',
  JSON.stringify(parseHeroTitle('Awal [[tanpa penutup'))
);
check(
  'penanda ganda didukung',
  parseHeroTitle('[[A]] tengah {{B}} dan [[C]]').filter((p) => p.tone).length === 3,
  JSON.stringify(parseHeroTitle('[[A]] tengah {{B}} dan [[C]]'))
);
// Keamanan: parser mengembalikan TEKS, bukan HTML → tidak ada jalur XSS.
const evil = parseHeroTitle('<img src=x onerror=alert(1)> [[<script>alert(2)</script>]]');
check(
  'HTML di judul tetap berupa teks, bukan markup',
  evil.every((p) => typeof p.text === 'string') && evil.map((p) => p.text).join('').includes('<img src=x'),
  JSON.stringify(evil).slice(0, 90)
);

// ---------- parseHeroPoints ----------
check(
  'poin dipisah per baris & kosong dibuang',
  parseHeroPoints('A\n\n  B  \nC').join('|') === 'A|B|C',
  parseHeroPoints('A\n\n  B  \nC').join('|')
);
const many = parseHeroPoints(Array.from({ length: 10 }, (_, i) => `P${i}`).join('\n'));
check(`jumlah poin dibatasi ${MAX_HERO_POINTS}`, many.length === MAX_HERO_POINTS, `${many.length} poin`);
check('poin kosong menghasilkan daftar kosong', parseHeroPoints('').length === 0);
check('panjang tiap poin dibatasi', parseHeroPoints('x'.repeat(500))[0].length === 160, `${parseHeroPoints('x'.repeat(500))[0].length} char`);

// ---------- isPublicImageUrl ----------
check('https dianggap publik', isPublicImageUrl('https://cdn.contoh.com/a.jpg'));
check('http dianggap publik', isPublicImageUrl('http://cdn.contoh.com/a.jpg'));
check('nilai local: TIDAK publik (butuh sesi)', !isPublicImageUrl('local:2026/01/a.jpg'));
check('nilai s3: TIDAK publik (butuh sesi)', !isPublicImageUrl('s3:newsroom/2026/01/a.jpg'));
check('kosong TIDAK publik', !isPublicImageUrl('') && !isPublicImageUrl(null));

// ---------- siteInitial ----------
check('huruf awal dari nama situs (huruf besar)', siteInitial('garudaTV Newsroom') === 'G');
check('nama kosong → huruf cadangan G', siteInitial('') === 'G' && siteInitial(null) === 'G' && siteInitial('   ') === 'G');

// ---------- schema ----------
const okParse = loginSettingsSchema.safeParse({
  heroBadge: DEFAULT_LOGIN.heroBadge,
  heroTitle: DEFAULT_LOGIN.heroTitle,
  heroPoints: DEFAULT_LOGIN.heroPoints,
  heroFooterNote: DEFAULT_LOGIN.heroFooterNote,
  heroFooterRights: DEFAULT_LOGIN.heroFooterRights,
  formTitle: DEFAULT_LOGIN.formTitle,
  formSubtitle: DEFAULT_LOGIN.formSubtitle,
  heroImageUrl: '',
  heroImageOpacity: '55',
});
check('nilai bawaan lolos validasi', okParse.success, okParse.success ? '' : JSON.stringify(okParse.error.issues[0]));
check(
  'semua kolom teks boleh dikosongkan (untuk menyembunyikan bagian)',
  loginSettingsSchema.safeParse({}).success,
  ''
);
check(
  'URL gambar non-http ditolak (agar tidak tampil rusak di halaman publik)',
  !loginSettingsSchema.safeParse({ heroImageUrl: 'local:2026/01/a.jpg' }).success
);
check('URL gambar https diterima', loginSettingsSchema.safeParse({ heroImageUrl: 'https://cdn.contoh.com/a.jpg' }).success);
check('judul terlalu panjang ditolak', !loginSettingsSchema.safeParse({ heroTitle: 'x'.repeat(400) }).success);
check('kepekatan non-angka ditolak', !loginSettingsSchema.safeParse({ heroImageOpacity: 'abc' }).success);
check(
  'judul bawaan tidak memuat kredensial (keamanan halaman login)',
  !/Demo123|@newsroom\.demo|sandi/i.test(JSON.stringify(DEFAULT_LOGIN))
);

console.log(`\n${pass}/${pass + fail} pemeriksaan unit halaman login lulus`);
if (fail) process.exit(1);
