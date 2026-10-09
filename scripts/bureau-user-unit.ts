/**
 * Uji unit aturan izin manajemen akun BIRO (tanpa browser/DB):
 * siapa boleh mengelola apa, di biro mana, dan batas-batasnya.
 *
 *   npx tsx scripts/bureau-user-unit.ts
 */
import type { Role } from '@prisma/client';
import {
  ACCOUNT_ADMIN_PROTECTED_MSG,
  ACCOUNT_SELF_MSG,
  BUREAU_MANAGED_ROLES,
  bureauAssignableRoles,
  canManageAccount,
  canManageBureau,
  canManageBureauMember,
  canManageBureauUsers,
  canManageStorage,
  canViewAudit,
  assignableRoles,
} from '../src/lib/permissions';

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

const MEDAN = 'biro-medan';
const SBY = 'biro-surabaya';

const actor = (role: Role, bureauId: string | null = null, id = 'aktor') => ({ id, role, bureauId });
const target = (role: Role, bureauId: string | null = null, id = 'sasaran') => ({ id, role, bureauId });

// ---------- Produser Daerah: siapa yang boleh mengelola akun ----------
check('Produser Daerah boleh mengelola akun biro', canManageBureauUsers(actor('PRODUSER_DAERAH', MEDAN)));
check('Admin boleh mengelola akun biro', canManageBureauUsers(actor('ADMIN')));
check('Super Admin boleh mengelola akun biro', canManageBureauUsers(actor('SUPER_ADMIN')));
const denied: Role[] = [
  'REPORTER_DAERAH',
  'MAGANG',
  'KONTRIBUTOR', // sebagai PENGELOLA akun (bukan sebagai role yang dibuat)
  'REPORTER_PUSAT',
  'PRODUSER_PUSAT',
  'REDAKTUR',
  'KOORDINATOR_LIPUTAN',
  'KOORDINATOR_DAERAH',
];
const wronglyAllowed = denied.filter((r) => canManageBureauUsers(actor(r, MEDAN)));
check('role lain TIDAK boleh mengelola akun biro', wronglyAllowed.length === 0, wronglyAllowed.join(', '));

// ---------- Role yang boleh dibuat Produser Daerah ----------
const pdRoles = bureauAssignableRoles(actor('PRODUSER_DAERAH', MEDAN));
check(
  'Produser Daerah dapat membuat Reporter Daerah, Magang, dan Kontributor',
  pdRoles.length === 3 &&
    pdRoles.includes('REPORTER_DAERAH') &&
    pdRoles.includes('MAGANG') &&
    pdRoles.includes('KONTRIBUTOR'),
  pdRoles.join(', ')
);
check('daftar role tetap konsisten dengan BUREAU_MANAGED_ROLES', [...pdRoles].sort().join() === [...BUREAU_MANAGED_ROLES].sort().join());
const forbiddenForPD: Role[] = ['PRODUSER_DAERAH', 'ADMIN', 'SUPER_ADMIN', 'REDAKTUR', 'PRODUSER_PUSAT', 'REPORTER_PUSAT', 'KOORDINATOR_LIPUTAN', 'KOORDINATOR_DAERAH'];
check(
  'Produser Daerah tidak dapat membuat role di luar wewenangnya',
  forbiddenForPD.every((r) => !pdRoles.includes(r)),
  `diperiksa ${forbiddenForPD.length} role`
);
check('Reporter Daerah tidak punya role yang bisa dikelola', bureauAssignableRoles(actor('REPORTER_DAERAH', MEDAN)).length === 0);
check('Magang tidak punya role yang bisa dikelola', bureauAssignableRoles(actor('MAGANG', MEDAN)).length === 0);

const adminRoles = bureauAssignableRoles(actor('ADMIN'));
check(
  'Admin dapat mengelola seluruh role daerah',
  ['PRODUSER_DAERAH', 'REPORTER_DAERAH', 'KONTRIBUTOR', 'MAGANG'].every((r) => adminRoles.includes(r as Role)),
  adminRoles.join(', ')
);

// ---------- Batas terhadap AKUN SASARAN ----------
check(
  'Produser Medan dapat mengelola Reporter Medan',
  canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN), target('REPORTER_DAERAH', MEDAN))
);
check(
  'Produser Medan dapat mengelola Magang Medan',
  canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN), target('MAGANG', MEDAN))
);
check(
  'Produser Medan TIDAK dapat mengelola Reporter Surabaya (lintas biro)',
  !canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN), target('REPORTER_DAERAH', SBY))
);
check(
  'Produser Medan TIDAK dapat mengelola Magang biro lain',
  !canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN), target('MAGANG', SBY))
);
check(
  'Produser Medan TIDAK dapat mengelola sesama Produser Daerah (biro sama)',
  !canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN), target('PRODUSER_DAERAH', MEDAN, 'pd2'))
);
check(
  'Produser Medan TIDAK dapat mengelola Kontributor biro lain (lintas biro)',
  !canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN), target('KONTRIBUTOR', SBY))
);
check(
  'Produser Medan dapat mengelola Kontributor pada biro sendiri',
  canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN), target('KONTRIBUTOR', MEDAN))
);
check(
  'Produser Medan TIDAK dapat mengelola role pusat',
  !canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN), target('REPORTER_PUSAT', null))
);
check(
  'Produser Daerah TIDAK dapat mengelola dirinya sendiri',
  !canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN, 'saya'), target('REPORTER_DAERAH', MEDAN, 'saya'))
);
check(
  'Produser Daerah tanpa biro tidak dapat mengelola siapa pun',
  !canManageBureauMember(actor('PRODUSER_DAERAH', null), target('REPORTER_DAERAH', MEDAN))
);
check(
  'Admin dapat mengelola akun biro mana pun',
  canManageBureauMember(actor('ADMIN'), target('REPORTER_DAERAH', SBY)) &&
    canManageBureauMember(actor('SUPER_ADMIN'), target('MAGANG', MEDAN)) &&
    canManageBureauMember(actor('ADMIN'), target('PRODUSER_DAERAH', SBY, 'pd3'))
);

// ---------- AUDIT Okt 2026 (A-2): akun ADMIN/SUPER_ADMIN dilindungi ----------
check(
  'Admin TIDAK dapat mengelola akun SUPER_ADMIN (cegah ambil alih akun puncak)',
  !canManageBureauMember(actor('ADMIN'), target('SUPER_ADMIN', null, 'sa1'))
);
check(
  'Admin TIDAK dapat mengelola akun sesama ADMIN',
  !canManageBureauMember(actor('ADMIN'), target('ADMIN', null, 'ad2'))
);
check(
  'Super Admin dapat mengelola akun ADMIN',
  canManageBureauMember(actor('SUPER_ADMIN'), target('ADMIN', null, 'ad3'))
);
check(
  'Super Admin TIDAK dapat mengelola akunnya sendiri dari halaman ini',
  !canManageBureauMember(actor('SUPER_ADMIN', null, 'sa0'), target('SUPER_ADMIN', null, 'sa0'))
);
check(
  'Admin TIDAK dapat mengelola akunnya sendiri',
  !canManageBureauMember(actor('ADMIN', null, 'ad0'), target('ADMIN', null, 'ad0'))
);
check(
  'Produser Daerah tetap tidak dapat mengelola akun admin',
  !canManageBureauMember(actor('PRODUSER_DAERAH', MEDAN), target('ADMIN', MEDAN, 'ad4'))
);

// ---------- AUDIT Okt 2026 (A-3): wewenang storage = SATU sumber kebenaran ----------
// Sebelumnya canManageStorage (SUPER_ADMIN saja) tidak selaras dengan ketiga action
// storage (SUPER_ADMIN+ADMIN) dan tidak pernah dipakai. Sekarang keduanya memakai
// fungsi ini, yang harus setara dengan wewenang pengelolaan lain (isAdmin).
const allRoles: Role[] = [
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
check(
  'canManageStorage: hanya Super Admin & Admin',
  canManageStorage(actor('SUPER_ADMIN')) &&
    canManageStorage(actor('ADMIN')) &&
    allRoles
      .filter((r) => r !== 'SUPER_ADMIN' && r !== 'ADMIN')
      .every((r) => !canManageStorage(actor(r))),
  allRoles.filter((r) => canManageStorage(actor(r))).join(', ')
);
check(
  'canManageStorage selaras dengan canManageBureau & canViewAudit di semua role',
  allRoles.every(
    (r) => canManageStorage(actor(r)) === canManageBureau(actor(r)) && canManageStorage(actor(r)) === canViewAudit(actor(r))
  ),
  `${allRoles.length} role diperiksa`
);

// ---------- Wewenang penuh (Admin) tidak berubah ----------
const fullRoles = assignableRoles(actor('ADMIN'));
check('Admin tetap dapat membuat role editorial/pusat', ['REDAKTUR', 'PRODUSER_PUSAT', 'REPORTER_PUSAT'].every((r) => fullRoles.includes(r as Role)), `${fullRoles.length} role`);
check('Admin tidak dapat membuat akun Super Admin/Admin', !fullRoles.includes('SUPER_ADMIN') && !fullRoles.includes('ADMIN'));
const superRoles = assignableRoles(actor('SUPER_ADMIN'));
check('Super Admin tetap dapat membuat Admin', superRoles.includes('ADMIN') && superRoles.includes('SUPER_ADMIN'), `${superRoles.length} role`);

// ---------- Daftar role Produser Daerah tidak bocor ke wewenang penuh ----------
check(
  'wewenang Produser Daerah tetap terbatas pada 3 role biro (bukan daftar luas)',
  assignableRoles(actor('PRODUSER_DAERAH', MEDAN)).length === 3 &&
    !assignableRoles(actor('PRODUSER_DAERAH', MEDAN)).includes('REDAKTUR') &&
    !assignableRoles(actor('PRODUSER_DAERAH', MEDAN)).includes('PRODUSER_PUSAT'),
  assignableRoles(actor('PRODUSER_DAERAH', MEDAN)).join(', ')
);

// =====================================================================================
// AUDIT LANJUTAN (A-2): SATU aturan bersama `canManageAccount` untuk SEMUA jalur
// pengelolaan akun (halaman Pengguna = 'global', halaman Akun Biro = 'bureau').
//
// Sebelumnya aturan ini ditulis ulang di tiap action; jalur Akun Biro tidak punya
// pengaman "hanya Super Admin boleh menyentuh akun admin" → Admin bisa mengambil alih
// akun Super Admin. Uji di bawah mengunci matriks lengkapnya.
// =====================================================================================
const g = (role: Role, bureauId: string | null = null, id = 'aktor') => ({ id, role, bureauId });
const t = (role: Role, bureauId: string | null = null, id = 'sasaran') => ({ id, role, bureauId });

// Akun admin puncak hanya untuk Super Admin (inti A-2), di KEDUA scope.
check(
  'Admin DITOLAK mengelola akun Super Admin (scope global & bureau)',
  !canManageAccount(g('ADMIN'), t('SUPER_ADMIN', null, 'sa1'), 'global').ok &&
    !canManageAccount(g('ADMIN'), t('SUPER_ADMIN', null, 'sa1'), 'bureau').ok
);
check(
  'pesan penolakan akun admin memakai pesan tunggal yang sama di kedua scope',
  (canManageAccount(g('ADMIN'), t('SUPER_ADMIN', null, 'sa1'), 'global') as { reason: string }).reason ===
    ACCOUNT_ADMIN_PROTECTED_MSG &&
    (canManageAccount(g('ADMIN'), t('ADMIN', null, 'ad9'), 'bureau') as { reason: string }).reason ===
      ACCOUNT_ADMIN_PROTECTED_MSG,
  ACCOUNT_ADMIN_PROTECTED_MSG
);
check(
  'Admin DITOLAK mengelola akun Admin lain (kedua scope)',
  !canManageAccount(g('ADMIN'), t('ADMIN', null, 'ad2'), 'global').ok &&
    !canManageAccount(g('ADMIN'), t('ADMIN', null, 'ad2'), 'bureau').ok
);
check(
  'Super Admin boleh mengelola akun Admin & akun biasa (kedua scope)',
  canManageAccount(g('SUPER_ADMIN', null, 'sa0'), t('ADMIN', null, 'ad3'), 'global').ok &&
    canManageAccount(g('SUPER_ADMIN', null, 'sa0'), t('ADMIN', null, 'ad3'), 'bureau').ok &&
    canManageAccount(g('SUPER_ADMIN', null, 'sa0'), t('REPORTER_DAERAH', MEDAN), 'global').ok
);

// Akun sendiri tidak pernah dikelola dari halaman pengelolaan.
check(
  'tidak seorang pun dapat mengelola akunnya sendiri (kedua scope)',
  !canManageAccount(g('SUPER_ADMIN', null, 'saya'), t('SUPER_ADMIN', null, 'saya'), 'global').ok &&
    !canManageAccount(g('ADMIN', null, 'saya'), t('ADMIN', null, 'saya'), 'bureau').ok &&
    (canManageAccount(g('ADMIN', null, 'saya'), t('ADMIN', null, 'saya'), 'global') as { reason: string }).reason ===
      ACCOUNT_SELF_MSG
);

// Admin pada halaman Pengguna (global) tetap boleh mengelola role editorial/pusat.
check(
  'Admin tetap dapat mengelola role editorial/pusat dari halaman Pengguna (scope global)',
  ['REDAKTUR', 'PRODUSER_PUSAT', 'REPORTER_PUSAT', 'KOORDINATOR_LIPUTAN'].every(
    (r) => canManageAccount(g('ADMIN'), t(r as Role, null), 'global').ok
  )
);

// TAPI halaman Akun Biro hanya untuk akun biro — bukan role editorial/pusat.
check(
  'Admin DITOLAK memakai halaman Akun Biro untuk akun TANPA biro (role pusat)',
  ['REDAKTUR', 'PRODUSER_PUSAT', 'REPORTER_PUSAT', 'KOORDINATOR_DAERAH'].every(
    (r) => !canManageAccount(g('ADMIN'), t(r as Role, null), 'bureau').ok
  )
);
check(
  'Admin DITOLAK memakai halaman Akun Biro untuk role editorial walau ber-biro (data tidak konsisten)',
  !canManageAccount(g('ADMIN'), t('REDAKTUR', MEDAN), 'bureau').ok
);
check(
  'Admin tetap boleh mengelola SELURUH role akun biro lintas biro (scope bureau)',
  bureauAssignableRoles(g('ADMIN')).every((r) =>
    canManageAccount(g('ADMIN'), t(r, SBY, 'anggota'), 'bureau').ok
  )
);

// Produser Daerah: lingkup biro sendiri, tidak berubah.
check(
  'Produser Daerah: biro sendiri boleh, lintas biro ditolak (scope bureau)',
  canManageAccount(g('PRODUSER_DAERAH', MEDAN), t('REPORTER_DAERAH', MEDAN), 'bureau').ok &&
    !canManageAccount(g('PRODUSER_DAERAH', MEDAN), t('REPORTER_DAERAH', SBY), 'bureau').ok
);
check(
  'role lain (Reporter/Magang/Redaktur/Produser Pusat) tidak dapat mengelola akun siapa pun',
  (['REPORTER_DAERAH', 'MAGANG', 'REDAKTUR', 'PRODUSER_PUSAT', 'KOORDINATOR_LIPUTAN'] as Role[]).every(
    (r) =>
      !canManageAccount(g(r, MEDAN), t('REPORTER_DAERAH', MEDAN), 'bureau').ok &&
      !canManageAccount(g(r, null), t('REPORTER_DAERAH', MEDAN), 'global').ok
  )
);
check(
  'canManageBureauMember tetap sejalan dengan canManageAccount(scope bureau)',
  allRoles.every(
    (r) =>
      canManageBureauMember(g(r, MEDAN), t('REPORTER_DAERAH', MEDAN)) ===
      canManageAccount(g(r, MEDAN), t('REPORTER_DAERAH', MEDAN), 'bureau').ok
  ),
  `${allRoles.length} role diperiksa`
);

console.log(`\n${pass}/${pass + fail} pemeriksaan unit izin akun biro lulus`);
if (fail) process.exit(1);
