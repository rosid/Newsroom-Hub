import { prisma } from './prisma';
import { genId } from './id';
import {
  canChatBetween,
  isChatRole,
  partnerSpecsFor,
  type ChatActor,
  type ChatActor as Actor,
} from './chat-rules';
import type { Role } from '@prisma/client';

/**
 * Helper chat sisi server.
 * Semua otorisasi dihitung dari data pengguna di DATABASE (bukan dari input klien),
 * memakai aturan murni di `chat-rules.ts`.
 */

export type ChatUserMini = {
  id: string;
  name: string;
  role: Role;
  bureauId: string | null;
  jobTitle: string | null;
  bureau: { id: string; name: string; code: string } | null;
};

const userSelect = {
  id: true,
  name: true,
  role: true,
  bureauId: true,
  jobTitle: true,
  bureau: { select: { id: true, name: true, code: true } },
} as const;

const actorOf = (u: { id: string; role: Role; bureauId: string | null }): ChatActor => ({
  id: u.id,
  role: u.role,
  bureauId: u.bureauId,
});

/** Ambil user dari DB lalu terapkan aturan klaster. */
export async function canChatWith(me: Actor, otherId: string): Promise<{ ok: boolean; other?: ChatUserMini }> {
  if (!otherId || otherId === me.id) return { ok: false };
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { ...userSelect, isActive: true } });
  if (!other || !other.isActive) return { ok: false };
  return { ok: canChatBetween(me, actorOf(other)), other };
}

/**
 * Daftar calon lawan chat sesuai aturan (klaster + eskalasi).
 * Memakai `partnerSpecsFor()` sebagai kandidat (superset), lalu disaring ulang dengan
 * `canChatBetween()` sehingga hasilnya persis sesuai aturan — termasuk aturan "biro sama".
 */
export async function getChatPartners(me: Actor): Promise<ChatUserMini[]> {
  if (!isChatRole(me.role)) return [];
  const specs = partnerSpecsFor(me);
  if (!specs.length) return [];

  const or = specs.map((sp) => ({
    role: sp.roles.length === 1 ? sp.roles[0] : { in: sp.roles },
    ...(sp.requireSameBureau ? { bureauId: me.bureauId } : {}),
  }));

  const users = await prisma.user.findMany({
    where: { isActive: true, id: { not: me.id }, OR: or as never },
    select: userSelect,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });

  return users.filter((u) => canChatBetween(me, actorOf(u)));
}

/** Percakapan dua arah yang unik (id partisipan dinormalisasi agar tidak duplikat). */
export async function getOrCreateConversation(meId: string, otherId: string): Promise<string | null> {
  if (!meId || !otherId || meId === otherId) return null;
  const [a, b] = meId < otherId ? [meId, otherId] : [otherId, meId];
  const existing = await prisma.conversation.findUnique({
    where: { participant1Id_participant2Id: { participant1Id: a, participant2Id: b } },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await prisma.conversation.create({
      data: { id: genId('conv'), participant1Id: a, participant2Id: b },
      select: { id: true },
    });
    return created.id;
  } catch {
    const again = await prisma.conversation.findUnique({
      where: { participant1Id_participant2Id: { participant1Id: a, participant2Id: b } },
      select: { id: true },
    });
    return again?.id ?? null;
  }
}

export type ConversationListItem = {
  id: string;
  other: ChatUserMini;
  lastMessage: { body: string; createdAt: Date; senderId: string; editedAt: Date | null } | null;
  unread: number;
  lastMessageAt: Date;
};

/** Daftar percakapan milik saya, diurutkan dari yang terbaru, lengkap dengan jumlah belum dibaca. */
export async function listConversations(me: Actor): Promise<ConversationListItem[]> {
  if (!isChatRole(me.role)) return [];

  const rows = await prisma.conversation.findMany({
    where: { OR: [{ participant1Id: me.id }, { participant2Id: me.id }] },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      participant1: { select: userSelect },
      participant2: { select: userSelect },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    take: 100,
  });

  const items: ConversationListItem[] = [];
  for (const c of rows) {
    const other = c.participant1Id === me.id ? c.participant2 : c.participant1;
    // Bila role/biro berubah sehingga klaster tidak lagi cocok, percakapan disembunyikan
    if (!canChatBetween(me, actorOf(other))) continue;
    const unread = await prisma.message.count({
      where: { conversationId: c.id, senderId: { not: me.id }, isRead: false },
    });
    const last = c.messages[0];
    items.push({
      id: c.id,
      other,
      lastMessage: last
        ? { body: last.body, createdAt: last.createdAt, senderId: last.senderId, editedAt: last.editedAt }
        : null,
      unread,
      lastMessageAt: c.lastMessageAt,
    });
  }
  return items;
}

/** Total pesan belum dibaca (untuk badge di sidebar). Aman bila tabel chat belum ada. */
export async function getChatUnreadCount(meId: string): Promise<number> {
  try {
    return await prisma.message.count({
      where: {
        isRead: false,
        senderId: { not: meId },
        conversation: { OR: [{ participant1Id: meId }, { participant2Id: meId }] },
      },
    });
  } catch {
    // Tabel chat mungkin belum dibuat (mis. migrasi boot gagal) — jangan merusak halaman lain
    return 0;
  }
}

/** Ambil percakapan + pastikan saya salah satu pesertanya, dan klaster masih sah. */
export async function getConversationForUser(conversationId: string, me: Actor) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participant1: { select: userSelect },
      participant2: { select: userSelect },
    },
  });
  if (!conv) return { ok: false as const, reason: 'notfound' as const };
  if (conv.participant1Id !== me.id && conv.participant2Id !== me.id) {
    return { ok: false as const, reason: 'forbidden' as const };
  }
  const other = conv.participant1Id === me.id ? conv.participant2 : conv.participant1;
  if (!canChatBetween(me, actorOf(other))) return { ok: false as const, reason: 'forbidden' as const };
  return { ok: true as const, conversation: conv, other };
}

export type ChatMessageDto = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  editedAt: string | null;
  isRead: boolean;
  mine: boolean;
};

export function toMessageDto(
  m: { id: string; body: string; senderId: string; createdAt: Date; editedAt: Date | null; isRead: boolean },
  meId: string
): ChatMessageDto {
  return {
    id: m.id,
    body: m.body,
    senderId: m.senderId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    isRead: m.isRead,
    mine: m.senderId === meId,
  };
}
