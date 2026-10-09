import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getConversationForUser, toMessageDto } from '@/lib/chat';
import { isChatRole } from '@/lib/chat-rules';
import { ROLE_LABELS } from '@/lib/constants';
import ChatThreadClient from '@/components/chat/ChatThreadClient';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Percakapan' };

export default async function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;

  if (!isChatRole(me.role)) notFound();

  const access = await getConversationForUser(id, me);
  if (!access.ok) {
    return (
      <div className="panel shadow-soft mx-auto max-w-lg p-6 text-center">
        <Icon name="lock" size={22} className="mx-auto text-muted" />
        <h1 className="mt-2 text-[16px] font-bold">Percakapan tidak dapat dibuka</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          {access.reason === 'notfound'
            ? 'Percakapan tidak ditemukan.'
            : 'Percakapan ini di luar klaster chat Anda (mis. lintas biro atau berbeda klaster).'}
        </p>
        <Link href="/dashboard/chat" className="btn btn-primary mt-4">
          Kembali ke daftar chat
        </Link>
      </div>
    );
  }

  const { other } = access;
  const rows = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
    take: 300,
  });

  // Tandai pesan lawan bicara sebagai sudah dibaca saat halaman dibuka
  await prisma.message.updateMany({
    where: { conversationId: id, senderId: { not: me.id }, isRead: false },
    data: { isRead: true },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <Link href="/dashboard/chat" className="inline-flex items-center gap-1 hover:text-accent">
          <Icon name="back" size={13} /> Daftar Chat
        </Link>
        <span>/</span>
        <span>{other.name}</span>
      </div>

      <ChatThreadClient
        conversationId={id}
        other={{
          id: other.id,
          name: other.name,
          jobTitle: other.jobTitle,
          roleLabel: ROLE_LABELS[other.role],
          bureauLabel: other.bureau?.name ?? '',
        }}
        initialMessages={rows.map((m) => toMessageDto(m, me.id))}
      />
    </div>
  );
}
