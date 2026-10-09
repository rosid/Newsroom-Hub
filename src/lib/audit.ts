import { headers } from 'next/headers';
import { prisma } from './prisma';
import { genId } from './id';
import type { CurrentUser } from './session';

export async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      '127.0.0.1'
    );
  } catch {
    return '';
  }
}

export async function logAudit(opts: {
  actor?: Pick<CurrentUser, 'id' | 'name' | 'role'> | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        id: genId(),
        actorId: opts.actor?.id ?? null,
        actorName: opts.actor?.name ?? 'Sistem',
        actorRole: opts.actor?.role ?? '-',
        action: opts.action,
        entity: opts.entity ?? '',
        entityId: opts.entityId ?? '',
        meta: opts.meta ? JSON.stringify(opts.meta).slice(0, 4000) : '',
        ip: await getClientIp(),
      },
    });
  } catch (e) {
    console.warn('[audit] gagal menyimpan log:', (e as Error).message);
  }
}
