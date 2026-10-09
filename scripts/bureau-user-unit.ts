/**
 * Uji unit aturan izin manajemen akun BIRO (tanpa browser/DB):
 * siapa boleh mengelola apa, di biro mana, dan batas-batasnya.
 *
 *   npx tsx scripts/bureau-user-unit.ts
 */
import type { Role } from '@prisma/client';
import {
  BUREAU_MANAGED_ROLES,
  bureauAssignableRoles,
  canManageBureauMember,
  canManageBureauUsers,
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

console.log(`\n${pass}/${pass + fail} pemeriksaan unit izin akun biro lulus`);
if (fail) process.exit(1);
