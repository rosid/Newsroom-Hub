'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { requireRole } from '@/lib/session';
import { genId } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import { announceToAudience } from '@/lib/announcements';
import { sanitizeHtml } from '@/lib/sanitize';
import { announcementSchema, zodToState, type ActionState } from '@/lib/validations';
import { canCreateAnnouncement } from '@/lib/permissions';

export async function saveAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canCreateAnnouncement(user)) return { ok: false, error: 'Anda tidak berhak membuat pengumuman.' };

  const parsed = announcementSchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    title: formData.get('title') ?? '',
    body: formData.get('body') ?? '',
    priority: formData.get('priority') ?? 'NORMAL',
    audience: formData.get('audience') ?? 'ALL',
    targetBureauId: formData.get('targetBureauId') ?? '',
    isActive: (formData.get('isActive') as string) ?? undefined,
    expiresAt: (formData.get('expiresAt') as string) ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;

  const body = sanitizeHtml(d.body);
  const isActive = d.isActive === 'on';

  try {
    if (d.id) {
      await prisma.announcement.update({
        where: { id: d.id },
        data: {
          title: d.title,
          body,
          priority: d.priority,
          audience: d.audience,
          targetBureauId: d.targetBureauId || null,
          isActive,
          expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59`) : null,
        },
      });
    } else {
      const created = await prisma.announcement.create({
        data: {
          id: genId(),
          title: d.title,
          body,
          priority: d.priority,
          audience: d.audience,
          targetBureauId: d.targetBureauId || null,
          isActive,
          createdById: user.id,
          createdByName: user.name,
          expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59`) : null,
        },
      });
      if (isActive) await announceToAudience(created.id);
    }

    await logAudit({
      actor: user,
      action: d.id ? 'ANNOUNCEMENT_UPDATE' : 'ANNOUNCEMENT_CREATE',
      entity: 'Announcement',
      entityId: d.id ?? '',
      meta: { title: d.title, priority: d.priority, audience: d.audience },
    });
  } catch (e) {
    console.error('[announcement] gagal simpan:', e);
    return { ok: false, error: 'Gagal menyimpan pengumuman.' };
  }

  return { ok: true, message: d.id ? 'Pengumuman diperbarui.' : 'Pengumuman dibuat & dikirim ke audiens.' };
}

export async function toggleAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN', 'REDAKTUR', 'PRODUSER_PUSAT', 'PRODUSER_DAERAH']);
  const id = String(formData.get('id') || '');
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) return { ok: false, error: 'Pengumuman tidak ditemukan.' };

  const next = !a.isActive;
  await prisma.announcement.update({ where: { id }, data: { isActive: next } });
  if (next) await announceToAudience(a.id);
  await logAudit({ actor: user, action: 'ANNOUNCEMENT_TOGGLE', entity: 'Announcement', entityId: id, meta: { isActive: next } });
  return { ok: true, message: next ? 'Pengumuman diaktifkan.' : 'Pengumuman dinonaktifkan.' };
}

export async function deleteAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canCreateAnnouncement(user)) return { ok: false, error: 'Anda tidak berhak menghapus pengumuman.' };
  const id = String(formData.get('id') || '');
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) return { ok: false, error: 'Pengumuman tidak ditemukan.' };
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN' && a.createdById !== user.id) {
    return { ok: false, error: 'Hanya pembuat atau admin yang dapat menghapus pengumuman ini.' };
  }
  await prisma.announcement.delete({ where: { id } });
  await logAudit({ actor: user, action: 'ANNOUNCEMENT_DELETE', entity: 'Announcement', entityId: id });
  return { ok: true, message: 'Pengumuman dihapus.' };
}
