/**
 * Uji aturan klaster chat & batas edit — murni (tanpa browser/DB).
 * Memverifikasi matriks lengkap pasangan role + aturan biro + jendela edit 60 detik
 * + pembersihan teks (teks/emoticon saja, gambar & HTML ditolak/dibuang).
 *
 *   npx tsx scripts/chat-unit.ts
 */
import type { Role } from '@prisma/client';
import {
  CHAT_CLUSTERS,
  CHAT_RULE_SUMMARIES,
  EDIT_WINDOW_MS,
  MAX_MESSAGE_LENGTH,
  canChatBetween,
  canEditMessage,
  clustersOfRole,
  editSecondsLeft,
  isChatRole,
  partnerSpecsFor,
  sanitizeChatText,
  validateChatText,
} from '../src/lib/chat-rules';

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

const ALL: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'REDAKTUR',
  'PRODUSER_PUSAT',
  'REPORTER_PUSAT',
  'PRODUSER_DAERAH',
  'REPORTER_DAERAH',
  'KONTRIBUTOR',
  'MAGANG',
  'KOORDINATOR_LIPUTAN',
  'KOORDINATOR_DAERAH',
];

const u = (role: Role, bureauId: string | null = null, id = `${role}-${bureauId ?? 'x'}`) => ({ id, role, bureauId });
const MEDAN = 'biro-medan';
const SBY = 'biro-surabaya';

const allowed = (a: ReturnType<typeof u>, b: ReturnType<typeof u>) => canChatBetween(a, b);

// ================= KLASTER 1: Reporter Daerah ↔ Produser Daerah (biro sama) =================
check(
  'Reporter Medan ↔ Produser Medan: boleh',
  allowed(u('REPORTER_DAERAH', MEDAN), u('PRODUSER_DAERAH', MEDAN))
);
check(
  'Reporter Medan ↔ Produser Surabaya: DILARANG (lintas biro)',
  !allowed(u('REPORTER_DAERAH', MEDAN), u('PRODUSER_DAERAH', SBY))
);
check(
  'Reporter Daerah tanpa biro ↔ Produser Daerah: DILARANG',
  !allowed(u('REPORTER_DAERAH', null), u('PRODUSER_DAERAH', MEDAN))
);
check(
  'Sesama Reporter Daerah: DILARANG',
  !allowed(u('REPORTER_DAERAH', MEDAN), u('REPORTER_DAERAH', MEDAN, 'reporter2'))
);
check(
  'Sesama Produser Daerah: DILARANG',
  !allowed(u('PRODUSER_DAERAH', MEDAN), u('PRODUSER_DAERAH', SBY, 'produser2'))
);

// ================= KLASTER 2: Pusat =================
// ALUR BARU (Okt 2026): Reporter Pusat → Koordinator Liputan → Produser Pusat.
check(
  'Reporter Pusat ↔ Produser Pusat: DILARANG (harus lewat Koordinator Liputan)',
  !allowed(u('REPORTER_PUSAT'), u('PRODUSER_PUSAT'))
);
check('Reporter Pusat ↔ Koordinator Liputan: boleh', allowed(u('REPORTER_PUSAT'), u('KOORDINATOR_LIPUTAN')));
check('Koordinator Liputan ↔ Produser Pusat: boleh', allowed(u('KOORDINATOR_LIPUTAN'), u('PRODUSER_PUSAT')));
check(
  'Role pusat ↔ Reporter Daerah: DILARANG',
  !allowed(u('PRODUSER_PUSAT'), u('REPORTER_DAERAH', MEDAN))
);
check('Produser Pusat ↔ Produser Daerah: DILARANG', !allowed(u('PRODUSER_PUSAT'), u('PRODUSER_DAERAH', MEDAN)));

// ================= KLASTER 3: Produser Daerah ↔ Koordinator Daerah =================
check(
  'Produser Medan ↔ Koordinator Daerah: boleh (semua biro)',
  allowed(u('PRODUSER_DAERAH', MEDAN), u('KOORDINATOR_DAERAH'))
);
check(
  'Produser Surabaya ↔ Koordinator Daerah: boleh',
  allowed(u('PRODUSER_DAERAH', SBY), u('KOORDINATOR_DAERAH'))
);
check(
  'Reporter Medan ↔ Koordinator Daerah: DILARANG',
  !allowed(u('REPORTER_DAERAH', MEDAN), u('KOORDINATOR_DAERAH'))
);
check(
  'Reporter Pusat ↔ Koordinator Daerah: DILARANG (beda klaster)',
  !allowed(u('REPORTER_PUSAT'), u('KOORDINATOR_DAERAH'))
);

// ================= Eskalasi: Redaktur, Admin, Super Admin =================
const escalationCallers: Role[] = ['PRODUSER_PUSAT', 'PRODUSER_DAERAH', 'KOORDINATOR_LIPUTAN', 'KOORDINATOR_DAERAH'];
(['REDAKTUR', 'ADMIN', 'SUPER_ADMIN'] as Role[]).forEach((target) => {
  escalationCallers.forEach((caller) => {
    check(
      `${caller} → ${target}: boleh`,
      canChatBetween(u(caller, MEDAN), u(target, null, `${target}-2`))
    );
  });
  const denied: Role[] = ['REPORTER_PUSAT', 'REPORTER_DAERAH', 'KONTRIBUTOR', 'MAGANG', 'REDAKTUR', 'ADMIN', 'SUPER_ADMIN'];
  const shouldDeny = denied.filter((r) => r !== target);
  const wrong = shouldDeny.filter((r) => canChatBetween(u(target, null), u(r, MEDAN, `${r}-2`)));
  check(
    `${target} tidak dapat dichat role di luar daftar (mis. Reporter/Kontributor/Magang/sesama)`,
    wrong.length === 0,
    wrong.join(', ')
  );
});

// ================= Kontributor & Magang =================
// ALUR BARU (Okt 2026): Kontributor → Koordinator Daerah → Produser Pusat.
check(
  'Kontributor ↔ Koordinator Liputan: DILARANG (dialihkan ke Koordinator Daerah)',
  !allowed(u('KONTRIBUTOR', MEDAN), u('KOORDINATOR_LIPUTAN'))
);
check('Kontributor ↔ Koordinator Daerah: boleh (alur baru)', allowed(u('KONTRIBUTOR', MEDAN), u('KOORDINATOR_DAERAH')));
check('Koordinator Daerah ↔ Produser Pusat: boleh (lanjutan alur ke pusat)', allowed(u('KOORDINATOR_DAERAH', MEDAN), u('PRODUSER_PUSAT')));
check('Magang Medan ↔ Koordinator Liputan: boleh', allowed(u('MAGANG', MEDAN), u('KOORDINATOR_LIPUTAN')));
check('Magang Medan ↔ Produser Medan: boleh (biro sama)', allowed(u('MAGANG', MEDAN), u('PRODUSER_DAERAH', MEDAN)));
check(
  'Magang Medan ↔ Produser Surabaya: DILARANG (lintas biro)',
  !allowed(u('MAGANG', MEDAN), u('PRODUSER_DAERAH', SBY))
);
check('Magang tanpa biro ↔ Produser Daerah: DILARANG', !allowed(u('MAGANG', null), u('PRODUSER_DAERAH', MEDAN)));
check('Kontributor ↔ Produser Daerah: DILARANG (tidak diminta)', !allowed(u('KONTRIBUTOR', MEDAN), u('PRODUSER_DAERAH', MEDAN)));
check('Kontributor ↔ Produser Pusat: DILARANG', !allowed(u('KONTRIBUTOR', MEDAN), u('PRODUSER_PUSAT')));
check('Sesama Kontributor: DILARANG', !allowed(u('KONTRIBUTOR', MEDAN), u('KONTRIBUTOR', MEDAN, 'k2')));
check('Sesama Magang: DILARANG', !allowed(u('MAGANG', MEDAN), u('MAGANG', MEDAN, 'm2')));
check('Admin ↔ Redaktur: DILARANG (tidak diminta)', !allowed(u('ADMIN', null), u('REDAKTUR', null, 'r2')));
check('Reporter Pusat ↔ Redaktur: DILARANG (tidak diminta)', !allowed(u('REPORTER_PUSAT'), u('REDAKTUR', null, 'r3')));

// ================= Setiap role punya setidaknya satu lawan chat =================
ALL.forEach((role) => {
  check(`Role ${role} punya lawan chat`, isChatRole(role));
});

// ================= partnerSpecsFor konsisten dengan canChatBetween =================
const specMismatch: string[] = [];
ALL.forEach((role) => {
  const specs = partnerSpecsFor(u(role, MEDAN));
  const covered = new Set<Role>();
  specs.forEach((sp) => sp.roles.forEach((r) => covered.add(r)));
  ALL.filter((r) => r !== role).forEach((other) => {
    // Setiap pasangan yang diizinkan harus tercakup kandidat, kecuali kasus "biro sama"
    // (spec menandai requireSameBureau dan diuji memakai biro yang sama).
    if (canChatBetween(u(role, MEDAN), u(other, MEDAN, `${other}-2`)) && !covered.has(other)) {
      specMismatch.push(`${role}→${other}`);
    }
  });
});
check('kandidat lawan chat mencakup semua pasangan yang diizinkan', specMismatch.length === 0, specMismatch.slice(0, 5).join(', '));

// ================= Matriks menyeluruh: hanya pasangan yang diizinkan =================
const pairKey = (a: Role, b: Role) => [a, b].sort().join('|');
// Daftar pasangan yang diizinkan (ditulis berpasangan, key dibuat otomatis agar bebas urutan)
/**
 * Matriks pasangan yang DIIZINKAN — mengikuti alur yang berlaku (perubahan Okt 2026):
 *   BIRO  : Reporter Daerah → Produser Daerah (biro sama) → Koordinator Daerah → Produser Pusat
 *   PUSAT : Reporter Pusat → Koordinator Liputan → Produser Pusat
 *           Kontributor   → Koordinator Daerah  → Produser Pusat
 * CATATAN: REPORTER_PUSAT↔PRODUSER_PUSAT dan KONTRIBUTOR↔KOORDINATOR_LIPUTAN SENGAJA
 * TIDAK ada di daftar (harus lewat perantara), dan diuji terpisah di bawah.
 */
const EXPECTED_PAIRS: [Role, Role][] = [
  // Alur biro
  ['REPORTER_DAERAH', 'PRODUSER_DAERAH'], // + syarat biro sama
  ['MAGANG', 'PRODUSER_DAERAH'], // + syarat biro sama
  ['PRODUSER_DAERAH', 'KOORDINATOR_DAERAH'],
  ['KOORDINATOR_DAERAH', 'PRODUSER_PUSAT'],
  // Alur pusat
  ['REPORTER_PUSAT', 'KOORDINATOR_LIPUTAN'],
  ['KOORDINATOR_LIPUTAN', 'PRODUSER_PUSAT'],
  // Kontributor & Magang
  ['KONTRIBUTOR', 'KOORDINATOR_DAERAH'],
  ['MAGANG', 'KOORDINATOR_LIPUTAN'],
  // Eskalasi Redaktur
  ['REDAKTUR', 'PRODUSER_PUSAT'],
  ['REDAKTUR', 'PRODUSER_DAERAH'],
  ['REDAKTUR', 'KOORDINATOR_LIPUTAN'],
  ['REDAKTUR', 'KOORDINATOR_DAERAH'],
  // Eskalasi Admin & Super Admin
  ['ADMIN', 'PRODUSER_PUSAT'],
  ['ADMIN', 'PRODUSER_DAERAH'],
  ['ADMIN', 'KOORDINATOR_LIPUTAN'],
  ['ADMIN', 'KOORDINATOR_DAERAH'],
  ['SUPER_ADMIN', 'PRODUSER_PUSAT'],
  ['SUPER_ADMIN', 'PRODUSER_DAERAH'],
  ['SUPER_ADMIN', 'KOORDINATOR_LIPUTAN'],
  ['SUPER_ADMIN', 'KOORDINATOR_DAERAH'],
];
const expected = new Set(EXPECTED_PAIRS.map(([a, b]) => pairKey(a, b)));
let mismatches: string[] = [];
ALL.forEach((a) => {
  ALL.forEach((b) => {
    if (a === b) return;
    const ok = canChatBetween(u(a, MEDAN), u(b, MEDAN, `${b}-2`));
    if (ok !== expected.has(pairKey(a, b))) mismatches.push(`${a}↔${b} (${ok ? 'boleh' : 'dilarang'})`);
  });
});
check('matriks 11 role sesuai aturan klaster', mismatches.length === 0, mismatches.slice(0, 4).join(', '));

// ===== Alur baru (Okt 2026): pasangan yang DICABUT dan yang DITAMBAH =====
check(
  'Reporter Pusat TIDAK boleh chat langsung ke Produser Pusat (wajib lewat Koordinator Liputan)',
  !canChatBetween(u('REPORTER_PUSAT', MEDAN), u('PRODUSER_PUSAT', MEDAN, 'pp'))
);
check(
  'Kontributor TIDAK lagi chat ke Koordinator Liputan (dialihkan ke Koordinator Daerah)',
  !canChatBetween(u('KONTRIBUTOR', MEDAN), u('KOORDINATOR_LIPUTAN', MEDAN, 'kl'))
);
check(
  'Kontributor BOLEH chat ke Koordinator Daerah (alur baru)',
  canChatBetween(u('KONTRIBUTOR', MEDAN), u('KOORDINATOR_DAERAH', MEDAN, 'kd'))
);
check(
  'Koordinator Daerah BOLEH chat ke Produser Pusat (lanjutan alur didorong ke pusat)',
  canChatBetween(u('KOORDINATOR_DAERAH', MEDAN), u('PRODUSER_PUSAT', MEDAN, 'pp'))
);
check(
  'Reporter Pusat tetap BOLEH chat ke Koordinator Liputan',
  canChatBetween(u('REPORTER_PUSAT', MEDAN), u('KOORDINATOR_LIPUTAN', MEDAN, 'kl'))
);
check(
  'Magang TETAP boleh chat Koordinator Liputan + Produser Daerah biro sama',
  canChatBetween(u('MAGANG', MEDAN), u('KOORDINATOR_LIPUTAN', MEDAN, 'kl')) &&
    canChatBetween(u('MAGANG', MEDAN), u('PRODUSER_DAERAH', MEDAN, 'pd')) &&
    !canChatBetween(u('MAGANG', MEDAN), u('PRODUSER_DAERAH', 'biro-lain', 'pd2'))
);
check(
  'setiap role tetap punya lawan chat (tidak ada yang terputus)',
  ALL.every((r) => isChatRole(r)),
  ALL.filter((r) => !isChatRole(r)).join(', ') || 'semua punya'
);
check(
  'kandidat kontak Reporter Pusat tidak memuat Produser Pusat',
  !partnerSpecsFor(u('REPORTER_PUSAT', MEDAN)).some((sp) => sp.roles.includes('PRODUSER_PUSAT'))
);
check(
  'kandidat kontak Koordinator Daerah memuat Produser Pusat & Kontributor',
  partnerSpecsFor(u('KOORDINATOR_DAERAH', MEDAN)).some((sp) => sp.roles.includes('PRODUSER_PUSAT')) &&
    partnerSpecsFor(u('KOORDINATOR_DAERAH', MEDAN)).some((sp) => sp.roles.includes('KONTRIBUTOR'))
);

check('Produser Daerah berada di 2 klaster', clustersOfRole('PRODUSER_DAERAH').length === 2, clustersOfRole('PRODUSER_DAERAH').join(' + '));
check('ada 3 klaster terdaftar', CHAT_CLUSTERS.length === 3);
check(
  'ringkasan aturan memuat alur baru (biro/pusat/kontributor/eskalasi/magang)',
  CHAT_RULE_SUMMARIES.length === 6 &&
    CHAT_RULE_SUMMARIES.some((r) => /Koordinator Daerah/.test(r.detail)) &&
    CHAT_RULE_SUMMARIES.some((r) => /Reporter Pusat/.test(r.detail)),
  `${CHAT_RULE_SUMMARIES.length} baris aturan`
);

// ================= Batas edit 60 detik =================
const me = { id: 'user-me' };
const now = Date.now();
const mk = (senderId: string, msAgo: number) => ({ senderId, createdAt: new Date(now - msAgo) });

check('pesan sendiri 0 detik lalu: boleh diedit', canEditMessage(mk(me.id, 0), me, now));
check('pesan sendiri 59 detik lalu: boleh diedit', canEditMessage(mk(me.id, 59_000), me, now));
check('pesan sendiri tepat 60 detik lalu: boleh diedit', canEditMessage(mk(me.id, EDIT_WINDOW_MS), me, now));
check('pesan sendiri 61 detik lalu: DILARANG', !canEditMessage(mk(me.id, 61_000), me, now));
check('pesan 5 menit lalu: DILARANG', !canEditMessage(mk(me.id, 5 * 60_000), me, now));
check('pesan orang lain 1 detik lalu: DILARANG', !canEditMessage(mk('user-lain', 1_000), me, now));
check('sisa waktu 60 detik untuk pesan baru', editSecondsLeft(new Date(now), now) === 60, String(editSecondsLeft(new Date(now), now)));
check('sisa waktu 0 untuk pesan lama', editSecondsLeft(new Date(now - 61_000), now) === 0);

// ================= Teks & emoticon saja =================
check('teks biasa diterima', validateChatText('Naskah sudah dikirim ke produser').ok);
check('emoticon diterima', validateChatText('Siap 👍').ok);
check('emoticon saja diterima', validateChatText('🙂').ok);
check('pesan kosong ditolak', !validateChatText('   ').ok);
check(
  `pesan > ${MAX_MESSAGE_LENGTH} karakter ditolak`,
  !validateChatText('a'.repeat(MAX_MESSAGE_LENGTH + 1)).ok
);
check(
  'tag <img> dibuang (tidak bisa menyisipkan gambar)',
  !sanitizeChatText('<img src="x.png">Halo').includes('<img'),
  JSON.stringify(sanitizeChatText('<img src="x.png">Halo'))
);
check(
  'data URL gambar dibuang',
  !sanitizeChatText('data:image/png;base64,AAA').includes('data:image'),
  JSON.stringify(sanitizeChatText('data:image/png;base64,AAA'))
);
check('javascript: dibuang', !sanitizeChatText('javascript:alert(1)').includes('javascript:'));
const withTag = validateChatText('<b>Tebal</b> tetap teks');
check('tag HTML dibuang tetapi teks tersisa', withTag.ok && withTag.body === 'Tebal tetap teks', withTag.ok ? withTag.body : '');
check('emoticon "<3" tidak ikut terhapus', sanitizeChatText('salam <3') === 'salam <3', sanitizeChatText('salam <3'));
check('hanya markup tanpa isi ditolak', !validateChatText('<br/><hr/>').ok);

console.log(`\n${pass}/${pass + fail} pemeriksaan unit chat lulus`);
if (fail) process.exit(1);
