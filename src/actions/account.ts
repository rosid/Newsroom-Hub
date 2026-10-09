'use server';

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import {
  accountProfileSchema,
  changePasswordSchema,
  zodToState,
  type ActionState,
} from '@/lib/validations';

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = accountProfileSchema.safeParse({
    name: formData.get('name') ?? '',
    phone: formData.get('phone') ?? '',
    jobTitle: formData.get('jobTitle') ?? '',
    avatarUrl: formData.get('avatarUrl') ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      jobTitle: parsed.data.jobTitle || null,
      avatarUrl: parsed.data.avatarUrl || null,
    },
  });
  await logAudit({ actor: user, action: 'ACCOUNT_PROFILE_UPDATE', entity: 'User', entityId: user.id });
  return { ok: true, message: 'Profil diperbarui.' };
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword') ?? '',
    newPassword: formData.get('newPassword') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { ok: false, error: 'Sandi saat ini salah.', fieldErrors: { currentPassword: 'Sandi saat ini salah.' } };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10), mustChangePass: false },
  });
  await logAudit({ actor: user, action: 'ACCOUNT_PASSWORD_CHANGE', entity: 'User', entityId: user.id });

  // Navigasi dilakukan client (lihat ChangePasswordForm) — hindari redirect di action.
  return { ok: true, message: 'Sandi berhasil diperbarui.' };
}
