import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { genId } from '@/lib/id';
import { getConversationForUser, toMessageDto } from '@/lib/chat';
import { EDIT_WINDOW_MS, canEditMessage, validateChatText } from '@/lib/chat-rules';

export const dynamic = 'force-dynamic';

/**
 * API percakapan chat.
 * - GET    : ambil pesan (opsional `?after=<ISO>` untuk polling) + tandai sudah dibaca.
 * - POST   : kirim pesan { body } — HANYA teks & emoticon.
 * - PATCH  : ubah pesan { messageId, body } — hanya pengirim, maksimal 60 detik.
 * - DELETE : sengaja TIDAK disediakan (pesan tidak dapat dihapus).
 */
async function autorize(conversationId: string) {
  const me = await getCurrentUser();
  if (!me) return { error: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  const res = await getConversationForUser(conversationId, me);
  if (!res.ok) {
    return {
      error: NextResponse.json(
        { ok: false, error: res.reason === 'notfound' ? 'Percakapan tidak ditemukan.' : 'Akses percakapan ditolak.' },
        { status: res.reason === 'notfound' ? 404 : 403 }
      ),
    };
  }
  return { me, conversation: res.conversation, other: res.other };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await autorize(id);
  if ('error' in auth) return auth.error;
  const { me, other } = auth;

  const after = new URL(req.url).searchParams.get('after');
  const afterDate = after ? new Date(after) : null;

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      ...(afterDate && !Number.isNaN(afterDate.getTime()) ? { createdAt: { gt: afterDate } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: afterDate ? 200 : 300,
  });

  // Tandai pesan dari lawan bicara sebagai sudah dibaca
  await prisma.message.updateMany({
    where: { conversationId: id, senderId: { not: me.id }, isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json({
    ok: true,
    editWindowMs: EDIT_WINDOW_MS,
    me: { id: me.id, name: me.name },
    other: {
      id: other.id,
      name: other.name,
      role: other.role,
      jobTitle: other.jobTitle,
      bureauName: other.bureau?.name ?? null,
      bureauCode: other.bureau?.code ?? null,
    },
    messages: messages.map((m) => toMessageDto(m, me.id)),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await autorize(id);
  if ('error' in auth) return auth.error;
  const { me } = auth;

  let payload: { body?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Data pesan tidak valid.' }, { status: 400 });
  }

  const check = validateChatText(String(payload.body ?? ''));
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });

  const created = await prisma.message.create({
    data: { id: genId('msg'), conversationId: id, senderId: me.id, body: check.body, isRead: false },
  });
  await prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });

  return NextResponse.json({ ok: true, message: toMessageDto(created, me.id) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await autorize(id);
  if ('error' in auth) return auth.error;
  const { me } = auth;

  let payload: { messageId?: string; body?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Data pesan tidak valid.' }, { status: 400 });
  }

  const messageId = String(payload.messageId ?? '');
  if (!messageId) return NextResponse.json({ ok: false, error: 'Pesan tidak dikenali.' }, { status: 400 });

  const message = await prisma.message.findFirst({ where: { id: messageId, conversationId: id } });
  if (!message) return NextResponse.json({ ok: false, error: 'Pesan tidak ditemukan.' }, { status: 404 });

  if (message.senderId !== me.id) {
    return NextResponse.json({ ok: false, error: 'Hanya pengirim pesan yang dapat mengubah pesannya.' }, { status: 403 });
  }
  if (!canEditMessage(message, me)) {
    return NextResponse.json(
      { ok: false, error: 'Batas waktu edit 60 detik sudah lewat — pesan tidak dapat diubah lagi.' },
      { status: 403 }
    );
  }

  const check = validateChatText(String(payload.body ?? ''));
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
  if (check.body === message.body) {
    return NextResponse.json({ ok: false, error: 'Isi pesan tidak berubah.' }, { status: 400 });
  }

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { body: check.body, editedAt: new Date() },
  });

  return NextResponse.json({ ok: true, message: toMessageDto(updated, me.id) });
}
