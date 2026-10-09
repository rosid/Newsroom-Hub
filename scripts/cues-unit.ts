/**
 * Uji unit sisipan Format Broadcast pada lapisan sanitasi (tanpa browser):
 * kelas chip penanda harus dipertahankan, sedangkan kelas/atribut lain tetap dibuang.
 *
 * Sejak audit keamanan Tahap 2 berkas ini juga menjaga PENGERASAN `sanitize.ts`:
 * atribut `style` hanya boleh memuat properti tampilan teks (temuan XSS-1 — CSS aktif
 * seperti `position:fixed`/`background-image:url(...)` pernah lolos apa adanya).
 *
 *   npx tsx scripts/cues-unit.ts
 */
import { sanitizeHtml, stripHtml } from '../src/lib/sanitize';
import { BROADCAST_CUES, CUE_CLASS, cueToneClass } from '../src/lib/broadcast-cues';

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

check('ada 5 penanda format siaran', BROADCAST_CUES.length === 5, BROADCAST_CUES.map((c) => c.code).join(' '));
check(
  'penanda sesuai daftar yang diminta',
  ['[ANCHOR ON CAM]', '[ROLL TAPE / FOOTAGE]', '[VO REPORTER]', '[SOUNDBITE / SOT]', '[STANDUP LIVE]'].every((code, i) =>
    BROADCAST_CUES[i].code === code
  )
);

// 1) Kelas chip dipertahankan di dalam naskah
BROADCAST_CUES.forEach((cue) => {
  const html = `<p><span class="${CUE_CLASS} ${cueToneClass(cue.tone)}">${cue.code}</span></p><p>Naskah.</p>`;
  const out = sanitizeHtml(html);
  check(
    `${cue.code}: chip & kelasnya dipertahankan`,
    out.includes(cue.code) &&
      out.includes(`${CUE_CLASS} ${cueToneClass(cue.tone)}`) &&
      out.includes(`<span class=`),
    out.slice(0, 80)
  );
});

// 2) Kelas asing dibuang (allow-list eksplisit)
const mixed = sanitizeHtml(`<span class="jahat ${CUE_CLASS} lain">[ANCHOR ON CAM]</span>`);
check('kelas asing dibuang, chip tetap ada', mixed === `<span class="${CUE_CLASS}">[ANCHOR ON CAM]</span>`, mixed);

// 3) Atribut berbahaya tetap dibuang
const evil = sanitizeHtml(`<span class="${CUE_CLASS}" onclick="alert(1)" onmouseover="x()">[VO REPORTER]</span>`);
check('event handler dibuang dari chip', !/onclick|onmouseover/i.test(evil), evil);

// 4) Script/img tetap dibuang walau naskah memuat penanda
const withScript = sanitizeHtml(
  `<p><span class="${CUE_CLASS}">[STANDUP LIVE]</span></p><script>alert(1)</script><img src=x onerror=alert(1)>`
);
check('tag script & img tetap dibuang', !/<script|<img/i.test(withScript), withScript.slice(0, 80));

// 5) stripHtml (pratinjau kartu) tetap menghasilkan teks penanda
const preview = stripHtml(`<p><span class="${CUE_CLASS}">[ANCHOR ON CAM]</span> Pembawa acara membuka.</p>`);
check('pratinjau teks memuat penanda', preview.includes('[ANCHOR ON CAM]') && preview.includes('Pembawa acara membuka'), preview);

// 6) Naskah tanpa penanda tetap aman (regresi)
const plain = sanitizeHtml('<p>Naskah biasa tanpa penanda.</p>');
check('naskah biasa tetap utuh', plain === '<p>Naskah biasa tanpa penanda.</p>', plain);

// =====================================================================================
// 7) PENGERASAN ATRIBUT `style` (perbaikan audit Tahap 2 — XSS-1)
//
// Sebelumnya `style` diizinkan tanpa batasan isi sehingga naskah/pengumuman dapat
// menyimpan CSS aktif: overlay penuh layar (form login palsu) dan beacon ke host luar.
// Sekarang hanya properti tampilan teks yang boleh bertahan.
// =====================================================================================
const overlay = sanitizeHtml(
  '<p>Halo</p><span style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#fff;z-index:99999">Login palsu</span>'
);
check(
  'CSS overlay (position/z-index/ukuran) dibuang',
  !/position|z-index|top:|left:|width:|height:/i.test(overlay) && overlay.includes('Login palsu'),
  overlay
);

const beacon = sanitizeHtml('<span style="background-image:url(https://jahat.example/x.png)">x</span>');
check('beacon background-image:url() dibuang', !/background-image|url\(/i.test(beacon), beacon);

const nonVisual = sanitizeHtml('<span style="content:url(https://jahat.example);cursor:pointer;filter:blur(2px)">x</span>');
check('properti content/cursor/filter dibuang', !/content|cursor|filter/i.test(nonVisual), nonVisual);

const mixedCss = sanitizeHtml('<span style="color:red;position:fixed;top:0">x</span>');
check(
  'properti jahat dibuang, properti sah dipertahankan',
  mixedCss === '<span style="color:red">x</span>',
  mixedCss
);

const hugeFont = sanitizeHtml('<span style="font-size:900px">x</span>');
const okFont = sanitizeHtml('<span style="font-size:14px">x</span>');
check('font-size ekstrem dibuang, ukuran wajar dipertahankan', hugeFont === '<span>x</span>' && okFont.includes('font-size:14px'), `${hugeFont} | ${okFont}`);

const styledChip = sanitizeHtml(`<span class="${CUE_CLASS} ${cueToneClass('anchor')}" style="position:fixed;top:0">[ANCHOR ON CAM]</span>`);
check(
  'chip penanda tetap utuh walau ada style jahat',
  styledChip.includes(`class="bc-cue bc-cue-anchor"`) && styledChip.includes('[ANCHOR ON CAM]') && !/position/i.test(styledChip),
  styledChip
);

console.log(`\n${pass}/${pass + fail} pemeriksaan unit penanda lulus`);
if (fail) process.exit(1);
