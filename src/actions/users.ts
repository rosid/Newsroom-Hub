'use server';

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/session';
import { genId } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notify';
import { assignableRoles } from '@/lib/permissions';
import { userCreateSchema, userUpdateSchema, zodToState, type ActionState } from '@/lib/validations';
import type { Role } from '@prisma/client';

const REGIONAL_ROLES: Role[] = ['PRODUSER_DAERAH', 'REPORTER_DAERAH', 'KONTRIBUTOR', 'MAGANG'];
const CENTRAL_ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'REDAKTUR',
  'PRODUSER_PUSAT',
  'REPORTER_PUSAT',
  'KOORDINATOR_LIPUTAN',
  'KOORDINATOR_DAERAH',
];

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const parsed = userCreateSchema.safeParse({
    name: formData.get('name') ?? '',
    email: formData.get('email') ?? '',
    role: formData.get('role') ?? '',
    bureauId: formData.get('bureauId') ?? '',
    jobTitle: formData.get('jobTitle') ?? '',
    phone: formData.get('phone') ?? '',
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;

  if (!assignableRoles(actor).includes(d.role)) {
    return { ok: false, error: 'Anda tidak berhak membuat pengguna dengan role tersebut.' };
  }
  const role = d.role as Role;
  if (REGIONAL_ROLES.includes(role) && !d.bureauId) {
    return { ok: false, error: 'Role daerah/kontributor/magang wajib memiliki biro.' };
  }

  const dup = await prisma.user.findUnique({ where: { email: d.email } });
  if (dup) return { ok: false, error: `Email ${d.email} sudah terdaftar.` };

  const passwordHash = await bcrypt.hash(d.password, 10);
  const created = await prisma.user.create({
    data: {
      id: genId(),
      name: d.name,
      email: d.email,
      passwordHash,
      role,
      bureauId: CENTRAL_ROLES.includes(role) ? null : d.bureauId || null,
      jobTitle: d.jobTitle || null,
      phone: d.phone || null,
      mustChangePass: true,
    },
  });

  await notifyUsers([created.id], {
    title: 'Akun Newsroom Hub Anda dibuat',
    body: `Role: ${role}. Silakan ubah sandi melalui menu Akun & Profil.`,
    link: '/dashboard/akun',
    type: 'INFO',
  });
  await logAudit({ actor, action: 'USER_CREATE', entity: 'User', entityId: created.id, meta: { email: d.email, role } });
  return { ok: true, message: `Pengguna ${d.name} berhasil dibuat.` };
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const parsed = userUpdateSchema.safeParse({
    id: formData.get('id') ?? '',
    name: formData.get('name') ?? '',
    role: formData.get('role') ?? '',
    bureauId: formData.get('bureauId') ?? '',
    jobTitle: formData.get('jobTitle') ?? '',
    phone: formData.get('phone') ?? '',
    isActive: (formData.get('isActive') as string) ?? undefined,
    newPassword: (formData.get('newPassword') as string) ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: d.id } });
  if (!target) return { ok: false, error: 'Pengguna tidak ditemukan.' };

  if (!assignableRoles(actor).includes(d.role as Role)) {
    return { ok: false, error: 'Anda tidak berhak memberi role tersebut.' };
  }
  if ((target.role === 'SUPER_ADMIN' || target.role === 'ADMIN') && actor.role !== 'SUPER_ADMIN') {
    return { ok: false, error: 'Hanya Super Admin yang dapat mengubah akun admin.' };
  }
  if (target.id === actor.id && d.isActive !== 'on') {
    return { ok: false, error: 'Tidak dapat menonaktifkan akun sendiri.' };
  }

  const role = d.role as Role;
  if (REGIONAL_ROLES.includes(role) && !d.bureauId) {
    return { ok: false, error: 'Role daerah/kontributor/magang wajib memiliki biro.' };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      name: d.name,
      role,
      bureauId: CENTRAL_ROLES.includes(role) ? null : d.bureauId || null,
      jobTitle: d.jobTitle || null,
      phone: d.phone || null,
      isActive: d.isActive === 'on',
      ...(d.newPassword
        ? { passwordHash: await bcrypt.hash(d.newPassword, 10), mustChangePass: true }
        : {}),
    },
  });

  await logAudit({
    actor,
    action: 'USER_UPDATE',
    entity: 'User',
    entityId: target.id,
    meta: { role, isActive: d.isActive === 'on', passwordReset: Boolean(d.newPassword) },
  });
  return { ok: true, message: 'Data pengguna diperbarui.' };
}

export async function toggleUserActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const id = String(formData.get('id') || '');
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: 'Pengguna tidak ditemukan.' };
  if (target.id === actor.id) return { ok: false, error: 'Tidak dapat menonaktifkan akun sendiri.' };
  if ((target.role === 'SUPER_ADMIN' || target.role === 'ADMIN') && actor.role !== 'SUPER_ADMIN') {
    return { ok: false, error: 'Hanya Super Admin yang dapat mengubah akun admin.' };
  }

  const next = !target.isActive;
  await prisma.user.update({ where: { id }, data: { isActive: next } });
  await logAudit({ actor, action: 'USER_TOGGLE_ACTIVE', entity: 'User', entityId: id, meta: { isActive: next } });
  return { ok: true, message: next ? 'Pengguna diaktifkan.' : 'Pengguna dinonaktifkan.' };
}

export async function deleteUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const id = String(formData.get('id') || '');
  if (id === actor.id) return { ok: false, error: 'Tidak dapat menghapus akun sendiri.' };

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: 'Pengguna tidak ditemukan.' };
  if ((target.role === 'SUPER_ADMIN' || target.role === 'ADMIN') && actor.role !== 'SUPER_ADMIN') {
    return { ok: false, error: 'Hanya Super Admin yang dapat menghapus akun admin.' };
  }
  if (target.role === 'SUPER_ADMIN') {
    const total = await prisma.user.count({ where: { role: 'SUPER_ADMIN', isActive: true } });
    if (total <= 1) return { ok: false, error: 'Super Admin terakhir tidak dapat dihapus.' };
  }

  const [news, reviewed] = await Promise.all([
    prisma.news.count({ where: { authorId: id } }),
    prisma.news.count({ where: { reviewedById: id } }),
  ]);
  if (news > 0) {
    return {
      ok: false,
      error: `Pengguna memiliki ${news} berita (riwayat editorial). Nonaktifkan saja agar data pemberitaan tetap utuh.`,
    };
  }
  if (reviewed > 0) {
    return { ok: false, error: `Pengguna tercatat sebagai pemvalidasi ${reviewed} berita. Nonaktifkan saja.` };
  }

  await prisma.notification.deleteMany({ where: { userId: id } });
  await prisma.auditLog.updateMany({ where: { actorId: id }, data: { actorId: null } });
  await prisma.user.delete({ where: { id } });
  await logAudit({ actor, action: 'USER_DELETE', entity: 'User', entityId: id, meta: { email: target.email, role: target.role } });
  return { ok: true, message: `Pengguna ${target.name} dihapus.` };
}
