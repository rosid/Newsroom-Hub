/**
 * Uji penjaga perubahan akun yang butuh DATA (`src/lib/account-guard.ts`) terhadap
 * SALINAN database — memastikan aturan "Super Admin aktif terakhir" benar-benar berlaku
 * pada UBAH ROLE dan NONAKTIFKAN (sebelumnya hanya ada pada jalur HAPUS).
 *
 * Uji ini TIDAK mengubah data: hanya memanggil penjaga lalu memeriksa ulang baris DB.
 *
 *   DATABASE_URL="file:/tmp/…/newsroom.db" npx tsx scripts/account-guard-unit.ts
 */
import { prisma } from '../src/lib/prisma';
import { countActiveSuperAdmins, guardAccountChange, LAST_SUPER_ADMIN_DELETE_MSG, LAST_SUPER_ADMIN_MSG } from '../src/lib/account-guard';

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

async function main() {
  const sa = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true, role: true, isActive: true, bureauId: true } });
  const other = await prisma.user.findFirst({ where: { role: 'REDAKTUR' }, select: { id: true, role: true, isActive: true, bureauId: true } });
  if (!sa || !other) {
    console.error('FAIL prasyarat: akun Super Admin / Redaktur tidak ada di DB uji');
    process.exit(1);
  }

  const activeSAs = await countActiveSuperAdmins();
  check('Super Admin aktif di DB uji = 1 (prasyarat penjaga terakhir)', activeSAs === 1, `${activeSAs} akun`);

  // Aktor Super Admin LAIN (id berbeda) → aturan peran lolos, sehingga yang diuji murni
  // aturan "jangan sampai 0 Super Admin aktif".
  const actorSa = { id: `${sa.id}-lain`, role: 'SUPER_ADMIN' as const, bureauId: null };

  const demote = await guardAccountChange({ actor: actorSa, target: sa, scope: 'global', nextRole: 'ADMIN' });
  check(
    'UBAH ROLE Super Admin aktif terakhir DITOLAK',
    !demote.ok && demote.reason === LAST_SUPER_ADMIN_MSG,
    demote.ok ? '(justru diizinkan!)' : demote.reason.slice(0, 60)
  );

  const deactivate = await guardAccountChange({ actor: actorSa, target: sa, scope: 'global', nextActive: false });
  check(
    'NONAKTIFKAN Super Admin aktif terakhir DITOLAK',
    !deactivate.ok && deactivate.reason === LAST_SUPER_ADMIN_MSG,
    deactivate.ok ? '(justru diizinkan!)' : deactivate.reason.slice(0, 60)
  );

  const remove = await guardAccountChange({ actor: actorSa, target: sa, scope: 'global', action: 'delete' });
  check(
    'HAPUS Super Admin aktif terakhir DITOLAK (pesan khusus hapus)',
    !remove.ok && remove.reason === LAST_SUPER_ADMIN_DELETE_MSG,
    remove.ok ? '(justru diizinkan!)' : remove.reason
  );

  const noop = await guardAccountChange({ actor: actorSa, target: sa, scope: 'global', nextRole: 'SUPER_ADMIN', nextActive: true });
  check('perubahan yang tidak mengurangi Super Admin aktif tetap DIIZINKAN', noop.ok, noop.ok ? '' : noop.reason);

  const nonSa = await guardAccountChange({ actor: actorSa, target: other, scope: 'global', nextRole: 'REPORTER_PUSAT' });
  check('Super Admin tetap dapat mengubah akun non-admin (Redaktur)', nonSa.ok, nonSa.ok ? '' : nonSa.reason);

  // Penegakan aturan peran tetap berlaku lewat penjaga bersama.
  const adminVsSa = await guardAccountChange({
    actor: { id: 'admin-uji', role: 'ADMIN', bureauId: null },
    target: sa,
    scope: 'bureau',
    nextRole: 'REPORTER_DAERAH',
  });
  check('penjaga bersama tetap menolak Admin terhadap akun Super Admin', !adminVsSa.ok, adminVsSa.ok ? '(justru diizinkan!)' : adminVsSa.reason);

  // Bukti tidak ada perubahan data akibat uji ini.
  const after = await prisma.user.findFirst({ where: { id: sa.id }, select: { role: true, isActive: true } });
  check(
    'akun Super Admin di DB tidak berubah (uji hanya membaca)',
    after?.role === 'SUPER_ADMIN' && after?.isActive === true,
    `${after?.role}/${after?.isActive}`
  );

  console.log(`\n${pass}/${pass + fail} pemeriksaan unit penjaga akun lulus`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}

main().catch(async (e) => {
  console.error('GAGAL:', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
