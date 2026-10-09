'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import { startChatAction, type StartChatState } from '@/actions/chat';

/**
 * Tombol memulai percakapan dengan seorang kontak (klaster chat).
 * Navigasi dilakukan di client setelah action sukses.
 */
export default function StartChatButton({
  otherId,
  otherName,
  label = 'Chat',
  className = 'btn btn-sm btn-primary',
}: {
  otherId: string;
  otherName: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<StartChatState, FormData>(startChatAction, {});

  useEffect(() => {
    if (state?.ok && state.conversationId) router.push(`/dashboard/chat/${state.conversationId}`);
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="otherId" value={otherId} />
      <button type="submit" className={className} disabled={pending} title={`Buka percakapan dengan ${otherName}`}>
        <Icon name="send" size={13} /> {pending ? 'Membuka…' : label}
      </button>
    </form>
  );
}
