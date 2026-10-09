/**
 * Uji unit token berbagi (tanpa browser / DB):
 * tanda tangan, kedaluwarsa, manipulasi token, dan pembatasan cakupan berkas.
 *
 *   npx tsx scripts/share-unit.ts
 */
import {
  signShareToken,
  verifyShareToken,
  shareAllowsKey,
  shareMediaPath,
  originalFilename,
  contentDispositionAttachment,
} from '../src/lib/share';

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

const now = Math.floor(Date.now() / 1000);

// 1) Token berita valid
const newsToken = signShareToken({ kind: 'news', newsId: 'news-1' }, 7);
const newsScope = verifyShareToken(newsToken);
check('token berita valid dapat diverifikasi', newsScope?.kind === 'news' && newsScope.newsId === 'news-1');
check(
  'masa berlaku token ≈ 7 hari',
  newsScope ? Math.abs(newsScope.exp - (now + 7 * 86400)) <= 5 : false,
  newsScope ? `${Math.round((newsScope.exp - now) / 86400)} hari` : ''
);

// 2) Token berkas tunggal + path yang dihasilkan
const mediaToken = signShareToken({ kind: 'media', storageKey: '2026/10/abc-berkas.mp4', filename: 'berkas.mp4' }, 1);
const mediaScope = verifyShareToken(mediaToken);
check('token berkas valid dapat diverifikasi', mediaScope?.kind === 'media');
check(
  'path lihat & unduh menyertakan token',
  shareMediaPath(mediaToken, '2026/10/abc-berkas.mp4').includes(`t=${encodeURIComponent(mediaToken)}`) &&
    shareMediaPath(mediaToken, '2026/10/abc-berkas.mp4', { download: true }).includes('download=1')
);

// 3) Kedaluwarsa
const expired = signShareToken({ kind: 'news', newsId: 'news-1', exp: now - 60 });
check('token kedaluwarsa ditolak', verifyShareToken(expired) === null);

// 4) Manipulasi token
const tamperedSig = `${newsToken.slice(0, -1)}${newsToken.endsWith('A') ? 'B' : 'A'}`;
check('tanda tangan yang diubah ditolak', verifyShareToken(tamperedSig) === null);
const [payloadB64] = newsToken.split('.');
const tamperedPayload = `${Buffer.from(JSON.stringify({ kind: 'news', newsId: 'news-9', exp: now + 999 })).toString('base64url')}.${newsToken.split('.')[1]}`;
check('payload yang ditukar (tanpa tanda tangan baru) ditolak', verifyShareToken(tamperedPayload) === null);
check('payload asli tetap dapat dibaca', Buffer.from(payloadB64, 'base64url').toString('utf8').includes('news-1'));
check('token kosong/ngawur ditolak', verifyShareToken('') === null && verifyShareToken('abc') === null);

// 5) Pembatasan cakupan
if (newsScope) {
  check('token berita mengizinkan berkas milik berita itu', shareAllowsKey(newsScope, '2026/10/x.png', 'news-1'));
  check('token berita MENOLAK berkas berita lain', !shareAllowsKey(newsScope, '2026/10/x.png', 'news-2'));
  check('token berita menolak berkas tanpa pemilik', !shareAllowsKey(newsScope, '2026/10/x.png', null));
}
if (mediaScope) {
  check('token berkas mengizinkan berkas itu sendiri', shareAllowsKey(mediaScope, '2026/10/abc-berkas.mp4', 'news-1'));
  check('token berkas MENOLAK berkas lain', !shareAllowsKey(mediaScope, '2026/10/lain.mp4', 'news-1'));
}

// 6) Nama berkas asli & header unduhan
check(
  'awalan UUID dibuang dari nama unduhan',
  originalFilename('2026/10/194aa7df-dbad-4b2d-85be-f2df79b93934-wawancara-menteri.mp4') === 'wawancara-menteri.mp4',
  originalFilename('2026/10/194aa7df-dbad-4b2d-85be-f2df79b93934-wawancara-menteri.mp4')
);
check('nama asli dari database diprioritaskan', originalFilename('x/abc-file.mp4', 'Nama Asli Editor.mp4') === 'Nama Asli Editor.mp4');
const cd = contentDispositionAttachment('wawancara menteri (final).mp4');
check('header unduhan memuat attachment + nama berkas', cd.startsWith('attachment; filename="') && cd.includes('filename*=UTF-8'));
check('header unduhan meng-escape tanda kutip', !contentDispositionAttachment('a"b.mp4').includes('filename="a"b.mp4"'));

console.log(`\n${pass}/${pass + fail} pemeriksaan unit share lulus`);
if (fail) process.exit(1);
