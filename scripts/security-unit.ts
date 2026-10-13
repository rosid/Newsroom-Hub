/**
 * Uji unit PENGATURAN KEAMANAN (tanpa browser/DB):
 *  - login throttling (batas, jendela waktu, blokir, reset),
 *  - verifikasi Turnstile (respons Cloudflare → keputusan, termasuk mode gagal),
 *  - batas umur sesi & schema validasinya.
 *
 *   npx tsx scripts/security-unit.ts
 */
import { checkThrottle, resetThrottle, throttleMessage, clearAllThrottle } from '../src/lib/login-throttle';
import { describeTurnstileError, verifyTurnstileResponse } from '../src/lib/turnstile';
import { DEFAULT_SECURITY, SECURITY_LIMITS, isTurnstileReady } from '../src/lib/settings';
import { securitySettingsSchema } from '../src/lib/validations';

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

// =====================================================================================
// 1. Login throttling
// =====================================================================================
const CFG = { maxAttempts: 3, windowMinutes: 10, blockMinutes: 5 };
const T0 = 1_700_000_000_000;
clearAllThrottle();

const r1 = checkThrottle('a|1', CFG, T0);
check('percobaan pertama tidak diblokir (sisa 2)', !r1.blocked && r1.remaining === 2, `sisa=${r1.remaining}`);
const r2 = checkThrottle('a|1', CFG, T0 + 1000);
check('percobaan kedua tidak diblokir (sisa 1)', !r2.blocked && r2.remaining === 1, `sisa=${r2.remaining}`);
const r3 = checkThrottle('a|1', CFG, T0 + 2000);
check('percobaan ketiga (batas) masih diizinkan', !r3.blocked && r3.remaining === 0, `sisa=${r3.remaining}`);
const r4 = checkThrottle('a|1', CFG, T0 + 3000);
check('melewati batas -> DIBLOKIR', r4.blocked, `blocked=${r4.blocked}`);
check('masa blokir dilaporkan (5 menit)', r4.retryAfterMinutes === 5, `${r4.retryAfterMinutes} menit`);

const r5 = checkThrottle('a|1', CFG, T0 + 60_000);
check(
  'masih diblokir di tengah masa blokir (sisa waktu dilaporkan)',
  r5.blocked && r5.retryAfterMinutes > 0 && r5.retryAfterMinutes <= 5,
  `sisa ${r5.retryAfterMinutes} menit`
);

// SEMANTIK YANG DISENGAJA: selama masih di dalam jendela waktu, percobaan berikutnya diblokir
// lagi (blokir diperpanjang). Ini yang membuat brute force tidak bisa "menunggu sebentar lalu
// menembak lagi" selama jendela berjalan.
const r6 = checkThrottle('a|1', CFG, T0 + 6 * 60_000);
check('masih dalam jendela: percobaan berikutnya diblokir lagi', r6.blocked, `blocked=${r6.blocked}`);

// Setelah JENDELA waktu lewat, hitungan direset dan percobaan diizinkan kembali.
const r7 = checkThrottle('a|1', CFG, T0 + 11 * 60_000);
check('setelah jendela waktu lewat -> boleh mencoba lagi', !r7.blocked && r7.remaining === 2, `sisa=${r7.remaining}`);

// Kunci berbeda tidak saling memengaruhi (per email + IP)
clearAllThrottle();
checkThrottle('a|1', CFG, T0);
checkThrottle('a|1', CFG, T0);
const other = checkThrottle('b|2', CFG, T0);
check('hitungan dipisah per email+IP', !other.blocked && other.remaining === 2, `sisa=${other.remaining}`);

// Jendela waktu: hitungan lama di luar jendela direset
clearAllThrottle();
checkThrottle('c|3', CFG, T0);
checkThrottle('c|3', CFG, T0 + 1000);
const afterWindow = checkThrottle('c|3', CFG, T0 + 11 * 60_000);
check('jendela baru setelah jendela lama lewat', !afterWindow.blocked && afterWindow.remaining === 2, `sisa=${afterWindow.remaining}`);

// Reset setelah login berhasil
clearAllThrottle();
checkThrottle('d|4', CFG, T0);
checkThrottle('d|4', CFG, T0);
resetThrottle('d|4');
const afterReset = checkThrottle('d|4', CFG, T0 + 2000);
check('reset setelah login berhasil mengembalikan sisa', afterReset.remaining === 2, `sisa=${afterReset.remaining}`);

check('pesan blokir menyebut menit', /menit/i.test(throttleMessage(5)) && throttleMessage(5).includes('5'), throttleMessage(5));
check('pesan blokir minimal 1 menit', throttleMessage(0).includes('1'), throttleMessage(0));

// =====================================================================================
// 3. Bawaan & batas
// =====================================================================================
check('bawaan: Turnstile nonaktif (tidak mengubah perilaku login)', DEFAULT_SECURITY.turnstileEnabled === false);
check('bawaan: umur sesi 72 jam (3x24 jam)', DEFAULT_SECURITY.sessionHours === 72, `${DEFAULT_SECURITY.sessionHours} jam`);
check('bawaan: throttling 5 percobaan / 10 menit / blokir 10 menit',
  DEFAULT_SECURITY.throttleMaxAttempts === 5 && DEFAULT_SECURITY.throttleWindowMinutes === 10 && DEFAULT_SECURITY.throttleBlockMinutes === 10);
check('batas sesi maksimum 30 hari', SECURITY_LIMITS.sessionHours.max === 720, `${SECURITY_LIMITS.sessionHours.max} jam`);

// =====================================================================================
// 4. Schema validasi
// =====================================================================================
check('schema: nilai bawaan valid saat form kosong', securitySettingsSchema.safeParse({}).success);
check('schema: angka non-numerik ditolak',
  !securitySettingsSchema.safeParse({ throttleMaxAttempts: 'abc' }).success &&
  !securitySettingsSchema.safeParse({ sessionHours: 'x' }).success);
// Schema membatasi JUMLAH DIGIT (1–4); pembatasan NILAI (maks 720 jam = 30 hari) dilakukan
// di action sebelum disimpan, sehingga nilai seperti 9999 tidak bisa dipakai.
check('schema: menerima angka 4 digit (akan dibatasi di action)', securitySettingsSchema.safeParse({ sessionHours: '9999' }).success);
check('schema: menolak angka 5 digit', !securitySettingsSchema.safeParse({ sessionHours: '99999' }).success);
check('schema: Site Key terlalu panjang ditolak', !securitySettingsSchema.safeParse({ turnstileSiteKey: 'x'.repeat(300) }).success);
check('schema: checkbox Turnstile menerima on/ kosong', securitySettingsSchema.safeParse({ turnstileEnabled: 'on' }).success && securitySettingsSchema.safeParse({ turnstileEnabled: '' }).success);


/**
 * Bagian Turnstile diuji di dalam fungsi async: `tsx` di proyek ini memakai keluaran CJS
 * (top-level await tidak didukung), jadi `await` harus berada di dalam fungsi.
 */
async function main() {
// =====================================================================================
// 2. Turnstile — verifikasi (menggunakan fetch tiruan, tanpa jaringan)
// =====================================================================================
const fakeFetch = (payload: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;

const okRes = await verifyTurnstileResponse({ secret: 's', token: 't', fetchImpl: fakeFetch({ success: true }) });
check('respons success:true diterima', okRes.ok, okRes.error ?? '');

const badRes = await verifyTurnstileResponse({
  secret: 's',
  token: 't',
  fetchImpl: fakeFetch({ success: false, 'error-codes': ['invalid-input-response'] }),
});
check('respons success:false ditolak dengan pesan', !badRes.ok && /tidak sah/i.test(badRes.error ?? ''), badRes.error ?? '');
check('kode error diteruskan untuk penelusuran', badRes.codes?.[0] === 'invalid-input-response');

check('tanpa token -> ditolak (tidak memanggil jaringan)', (await verifyTurnstileResponse({ secret: 's', token: '' })).ok === false);
check('tanpa secret -> ditolak', (await verifyTurnstileResponse({ secret: '', token: 't' })).ok === false);

const timedOut = await verifyTurnstileResponse({
  secret: 's',
  token: 't',
  fetchImpl: (async () => {
    throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  }) as unknown as typeof fetch,
});
check('kegagalan jaringan ditangani (tidak melempar)', !timedOut.ok && /waktu|dihubungi/i.test(timedOut.error ?? ''), timedOut.error ?? '');

const httpErr = await verifyTurnstileResponse({ secret: 's', token: 't', fetchImpl: fakeFetch({}, 503) });
check('HTTP 5xx dilaporkan sebagai galat, bukan crash', !httpErr.ok && /503/.test(httpErr.error ?? ''), httpErr.error ?? '');

check(
  'pesan galat secret tidak valid ditindaklanjuti (menunjuk halaman pengaturan)',
  describeTurnstileError(['invalid-input-secret']).includes('Pengaturan')
);
check('pesan timeout/duplikat menyebut kedaluwarsa', /kedaluwarsa/i.test(describeTurnstileError(['timeout-or-duplicate'])));

// isTurnstileReady: harus butuh ON + site key + secret
check('isTurnstileReady: ON + kunci lengkap = siap', isTurnstileReady({ turnstileEnabled: true, turnstileSiteKey: 'sk', turnstileSecret: 'sec' }));
check('isTurnstileReady: OFF = tidak siap walau kunci ada', !isTurnstileReady({ turnstileEnabled: false, turnstileSiteKey: 'sk', turnstileSecret: 'sec' }));
check('isTurnstileReady: kunci kurang = tidak siap', !isTurnstileReady({ turnstileEnabled: true, turnstileSiteKey: 'sk', turnstileSecret: '' }));


  console.log(`\n${pass}/${pass + fail} pemeriksaan unit keamanan lulus`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error('GAGAL:', e);
  process.exit(1);
});
