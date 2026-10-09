/**
 * Uji unit sisipan Format Broadcast pada lapisan sanitasi (tanpa browser):
 * kelas chip penanda harus dipertahankan, sedangkan kelas/atribut lain tetap dibuang.
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

console.log(`\n${pass}/${pass + fail} pemeriksaan unit penanda lulus`);
if (fail) process.exit(1);
