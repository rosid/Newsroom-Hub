'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { canChatWith, getOrCreateConversation } from '@/lib/chat';
import { isChatRole } from '@/lib/chat-rules';
import type { ActionState } from '@/lib/validations';

export type StartChatState = ActionState & { conversationId?: string; otherName?: string };

/**
 * Mulai (atau buka kembali) percakapan dengan pengguna yang diizinkan klaster.
 * Navigasi dilakukan di client memakai `conversationId` yang dikembalikan
 * (server action tidak memakai redirect() — lihat catatan di actions/auth.ts).
 */
export async function startChatAction(_prev: StartChatState, formData: FormData): Promise<StartChatState> {
  const me = await requireUser();
  if (!isChatRole(me.role)) {
    return { ok: false, error: 'Role Anda tidak termasuk dalam klaster chat.' };
  }

  const otherId = String(formData.get('otherId') || '');
  const check = await canChatWith(me, otherId);
  if (!check.ok || !check.other) {
    return { ok: false, error: 'Pengguna ini tidak termasuk klaster chat Anda.' };
  }

  try {
    const conversationId = await getOrCreateConversation(me.id, check.other.id);
    if (!conversationId) return { ok: false, error: 'Gagal membuka percakapan.' };

    await logAudit({
      actor: me,
      action: 'CHAT_START',
      entity: 'Conversation',
      entityId: conversationId,
      meta: { with: check.other.name, withRole: check.other.role },
    });

    return {
      ok: true,
      conversationId,
      otherName: check.other.name,
      message: `Percakapan dengan ${check.other.name} dibuka.`,
    };
  } catch (e) {
    console.error('[chat] gagal membuka percakapan:', e);
    return { ok: false, error: 'Gagal membuka percakapan. Coba lagi.' };
  }
}

/** Jumlah pesan belum dibaca (dipakai bila perlu menyegarkan badge tanpa memuat halaman). */
export async function getChatUnreadAction(): Promise<number> {
  const me = await requireUser();
  if (!isChatRole(me.role)) return 0;
  try {
    return await prisma.message.count({
      where: {
        isRead: false,
        senderId: { not: me.id },
        conversation: { OR: [{ participant1Id: me.id }, { participant2Id: me.id }] },
      },
    });
  } catch {
    return 0;
  }
}
