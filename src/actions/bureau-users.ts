'use server';

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { genId } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notify';
import {
  ACCOUNT_SELF_MSG,
  BUREAU_MANAGED_ROLES,
  bureauAssignableRoles,
  canManageBureauUsers,
} from '@/lib/permissions';
import { guardAccountChange } from '@/lib/account-guard';
import { strongPassword, zodToState, type ActionState } from '@/lib/validations';
import { roleListText } from '@/lib/constants';
import { z } from 'zod';
import type { Role } from '@prisma/client';

/** Label ringkas untuk pesan galat (tanpa mengimpor modul client-safe yang besar). */
const ROLE_LABELS_FALLBACK: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin Redaksi',
  REDAKTUR: 'Redaktur',
  PRODUSER_PUSAT: 'Produser Pusat',
  REPORTER_PUSAT: 'Reporter Pusat',
  PRODUSER_DAERAH: 'Produser Daerah',
  REPORTER_DAERAH: 'Reporter Daerah',
  KONTRIBUTOR: 'Kontributor',
  MAGANG: 'Magang',
  KOORDINATOR_LIPUTAN: 'Koordinator Liputan',
  KOORDINATOR_DAERAH: 'Koordinator Daerah',
};

/**
 * Manajemen akun LINGKUP BIRO.
 *
 * Dipakai Produser Daerah untuk membuat & merawat akun Reporter Daerah dan Magang
 * di biro-nya sendiri — dan Admin/Super Admin untuk seluruh biro.
 *
 * Semua batasan ditegakkan di SERVER (bukan hanya disembunyikan di UI):
 * - hanya role yang diizinkan (`bureauAssignableRoles`),
 * - biro SELALU diambil dari akun aktor untuk Produser Daerah (tidak bisa dipalsukan lewat form),
 * - akun sasaran diperiksa oleh SATU penjaga bersama (`guardAccountChange`, scope 'bureau'):
 *   akun admin/super admin hanya boleh disentuh Super Admin, Admin hanya boleh menyentuh
 *   akun biro, Produser Daerah hanya biro-nya sendiri,
 * - tidak dapat mengubah/menonaktifkan dirinya sendiri.
 *
 * JANGAN menulis ulang pemeriksaan ini di dalam action — duplikasi itulah penyebab celah
 * audit A-2 (pengaman ada di satu jalur, tidak ada di jalur lain).
 */

const bureauUserCreateSchema = z.object({
  name: z.string().trim().min(3, 'Nama minimal 3 karakter'),
  email: z.string().trim().toLowerCase().email('Email tidak valid'),
  // Role divalidasi terhadap daftar wewenang aktor DENGAN PESAN YANG JELAS (bukan pesan enum zod),
  // karena form ini menerima role dari klien dan bisa dipalsukan.
  role: z.string().trim().min(1, 'Role wajib dipilih'),
  jobTitle: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
  password: strongPassword,
  // Hanya dipakai Admin/Super Admin; untuk Produser Daerah selalu diabaikan.
  bureauId: z.string().optional().default(''),
});

const bureauUserUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(3, 'Nama minimal 3 karakter'),
  role: z.string().trim().min(1, 'Role wajib dipilih'),
  jobTitle: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
  isActive: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
  newPassword: z.union([z.literal(''), strongPassword]).optional().default(''),
});

/** Biro efektif untuk aktor: Produser Daerah selalu biro-nya sendiri. */
function resolveBureauId(actor: { role: Role; bureauId: string | null }, formBureauId: string): string | null {
  if (actor.role === 'PRODUSER_DAERAH') return actor.bureauId;
  return formBureauId || null;
}

export async function createBureauUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!canManageBureauUsers(actor)) {
    return { ok: false, error: 'Anda tidak berhak membuat akun pengguna.' };
  }

  const parsed = bureauUserCreateSchema.safeParse({
    name: formData.get('name') ?? '',
    email: formData.get('email') ?? '',
    role: formData.get('role') ?? '',
    jobTitle: formData.get('jobTitle') ?? '',
    phone: formData.get('phone') ?? '',
    password: formData.get('password') ?? '',
    bureauId: (formData.get('bureauId') as string) ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;
  const role = d.role as Role;

  // Batas role: Produser Daerah hanya Reporter Daerah & Magang
  const allowedRoles = bureauAssignableRoles(actor);
  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      error:
        actor.role === 'PRODUSER_DAERAH'
          ? `Produser Daerah hanya dapat membuat akun ${roleListText(bureauAssignableRoles(actor))} pada biro sendiri.`
          : `Role ${ROLE_LABELS_FALLBACK[role] ?? role} tidak dapat Anda buat di halaman ini.`,
      fieldErrors: { role: 'Role tidak diizinkan untuk akun Anda' },
    };
  }

  const bureauId = resolveBureauId(actor, d.bureauId);
  if (!bureauId) {
    return {
      ok: false,
      error:
        actor.role === 'PRODUSER_DAERAH'
          ? 'Akun Anda belum terhubung ke biro, sehingga tidak dapat membuat akun anggota biro. Hubungi admin redaksi.'
          : 'Biro wajib dipilih untuk role daerah.',
    };
  }

  const dup = await prisma.user.findUnique({ where: { email: d.email }, select: { id: true } });
  if (dup) return { ok: false, error: `Email ${d.email} sudah terdaftar.` };

  const created = await prisma.user.create({
    data: {
      id: genId(),
      name: d.name,
      email: d.email,
      passwordHash: await bcrypt.hash(d.password, 10),
      role,
      bureauId,
      jobTitle: d.jobTitle || null,
      phone: d.phone || null,
      // Wajib ganti sandi saat pertama masuk (sandi awal diberikan pembuat akun)
      mustChangePass: true,
    },
  });

  await notifyUsers([created.id], {
    title: 'Akun Newsroom Hub Anda dibuat',
    body: `Role: ${ROLE_LABELS_FALLBACK[role] ?? role}. Silakan ubah sandi melalui menu Akun & Profil.`,
    link: '/dashboard/akun',
    type: 'INFO',
  });
  await logAudit({
    actor,
    action: 'BUREAU_USER_CREATE',
    entity: 'User',
    entityId: created.id,
    meta: { email: d.email, role, bureauId, byRole: actor.role },
  });

  return {
    ok: true,
    message: `Akun ${d.name} (${ROLE_LABELS_FALLBACK[role] ?? role}) berhasil dibuat. Sampaikan sandi awal kepada yang bersangkutan dan minta segera diganti.`,
  };
}

export async function updateBureauUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!canManageBureauUsers(actor)) return { ok: false, error: 'Anda tidak berhak mengubah akun pengguna.' };

  const parsed = bureauUserUpdateSchema.safeParse({
    id: formData.get('id') ?? '',
    name: formData.get('name') ?? '',
    role: formData.get('role') ?? '',
    jobTitle: formData.get('jobTitle') ?? '',
    phone: formData.get('phone') ?? '',
    isActive: (formData.get('isActive') as string) ?? undefined,
    newPassword: (formData.get('newPassword') as string) ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: d.id } });
  if (!target) return { ok: false, error: 'Pengguna tidak ditemukan.' };

  // Akun sendiri: pesan khusus (guard bersama juga menolaknya).
  if (target.id === actor.id) return { ok: false, error: ACCOUNT_SELF_MSG };

  const role = d.role as Role;
  // Penjaga bersama: akun admin/super admin hanya untuk Super Admin; lingkup akun biro untuk sisanya.
  const guard = await guardAccountChange({
    actor,
    target,
    scope: 'bureau',
    nextRole: role,
    nextActive: d.isActive === 'on',
  });
  if (!guard.ok) return { ok: false, error: guard.reason, fieldErrors: guard.fieldErrors };

  if (!bureauAssignableRoles(actor).includes(role)) {
    return { ok: false, error: 'Role tersebut tidak dapat Anda tetapkan untuk akun biro ini.', fieldErrors: { role: 'Role tidak diizinkan' } };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      name: d.name,
      role,
      jobTitle: d.jobTitle || null,
      phone: d.phone || null,
      isActive: d.isActive === 'on',
      // Biro tidak diubah: Produser Daerah hanya mengelola biro-nya sendiri
      ...(d.newPassword ? { passwordHash: await bcrypt.hash(d.newPassword, 10), mustChangePass: true } : {}),
    },
  });

  await logAudit({
    actor,
    action: 'BUREAU_USER_UPDATE',
    entity: 'User',
    entityId: target.id,
    meta: { role, isActive: d.isActive === 'on', passwordReset: Boolean(d.newPassword) },
  });

  return { ok: true, message: `Data ${d.name} diperbarui.` };
}

export async function toggleBureauUserActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!canManageBureauUsers(actor)) return { ok: false, error: 'Anda tidak berhak mengubah status akun.' };

  const id = String(formData.get('id') || '');
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: 'Pengguna tidak ditemukan.' };
  if (target.id === actor.id) return { ok: false, error: ACCOUNT_SELF_MSG };

  const guard = await guardAccountChange({
    actor,
    target,
    scope: 'bureau',
    nextActive: !target.isActive,
  });
  if (!guard.ok) return { ok: false, error: guard.reason, fieldErrors: guard.fieldErrors };

  const next = !target.isActive;
  await prisma.user.update({ where: { id }, data: { isActive: next } });
  await logAudit({ actor, action: 'BUREAU_USER_TOGGLE_ACTIVE', entity: 'User', entityId: id, meta: { isActive: next } });
  return { ok: true, message: next ? `${target.name} diaktifkan.` : `${target.name} dinonaktifkan (tidak dapat masuk).` };
}
