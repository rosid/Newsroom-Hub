'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { BASE_PATH } from '@/lib/base';
import {
  CHAT_EMOJIS,
  CHAT_POLL_MS,
  MAX_MESSAGE_LENGTH,
  editSecondsLeft,
} from '@/lib/chat-rules';

export type ChatMessageDto = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  editedAt: string | null;
  isRead: boolean;
  mine: boolean;
};

type Other = {
  id: string;
  name: string;
  jobTitle: string | null;
  roleLabel: string;
  bureauLabel: string;
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Ruang chat (teks + emoticon saja):
 * - Kirim pesan teks/emoticon (tidak ada unggah gambar/berkas).
 * - Edit pesan sendiri maksimal 60 detik setelah dikirim (di-server juga ditegakkan).
 * - TIDAK ada tombol/menu hapus pesan (server juga tidak menyediakannya).
 */
export default function ChatThreadClient({
  conversationId,
  other,
  initialMessages,
}: {
  conversationId: string;
  other: Other;
  initialMessages: ChatMessageDto[];
}) {
  const [messages, setMessages] = useState<ChatMessageDto[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [, setTick] = useState(0);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Penghitung waktu untuk status "bisa diedit (sisa N detik)"
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!atBottomRef.current && !force) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [scrollToBottom]);

  /** Polling pesan baru (hanya saat tab terlihat). */
  const poll = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    const last = messages[messages.length - 1];
    const params = last ? `?after=${encodeURIComponent(last.createdAt)}` : '';
    try {
      const res = await fetch(`${BASE_PATH}/api/chat/${conversationId}${params}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && Array.isArray(data.messages) && data.messages.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = (data.messages as ChatMessageDto[]).filter((m) => !seen.has(m.id));
          if (!fresh.length) return prev;
          return [...prev, ...fresh];
        });
        scrollToBottom();
      }
    } catch {
      /* diamkan: percobaan berikutnya menyusul */
    }
  }, [conversationId, messages, scrollToBottom]);

  useEffect(() => {
    const t = setInterval(() => void poll(), CHAT_POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${BASE_PATH}/api/chat/${conversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Gagal mengirim pesan (HTTP ${res.status}).`);
        return;
      }
      setMessages((prev) => [...prev, data.message as ChatMessageDto]);
      setDraft('');
      atBottomRef.current = true;
      scrollToBottom(true);
      areaRef.current?.focus();
    } catch (e) {
      setError(`Gagal mengirim pesan: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editing.body.trim();
    if (!body) {
      setError('Pesan tidak boleh kosong.');
      return;
    }
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${BASE_PATH}/api/chat/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: editing.id, body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Gagal menyimpan perubahan (HTTP ${res.status}).`);
        return;
      }
      const updated = data.message as ChatMessageDto;
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditing(null);
      setNotice('Pesan diperbarui.');
      setTimeout(() => setNotice(''), 2500);
    } catch (e) {
      setError(`Gagal menyimpan perubahan: ${(e as Error).message}`);
    }
  };

  const insertEmoji = (emoji: string) => {
    const area = editing ? null : areaRef.current;
    if (editing) {
      setEditing({ ...editing, body: `${editing.body}${emoji}` });
      return;
    }
    if (!area) {
      setDraft((d) => `${d}${emoji}`);
      return;
    }
    const start = area.selectionStart ?? draft.length;
    const end = area.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    setDraft(next.slice(0, MAX_MESSAGE_LENGTH));
    requestAnimationFrame(() => {
      area.focus();
      const pos = start + emoji.length;
      area.setSelectionRange(pos, pos);
    });
  };

  const remainingChars = MAX_MESSAGE_LENGTH - draft.length;
  const grouped = useMemo(() => {
    const out: { day: string; items: ChatMessageDto[] }[] = [];
    messages.forEach((m) => {
      const day = dateOf(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    });
    return out;
  }, [messages]);

  return (
    <div className="flex flex-col gap-3">
      {/* Kepala percakapan */}
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[12px] font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            {other.name
              .split(' ')
              .slice(0, 2)
              .map((s) => s[0])
              .join('')}
          </span>
          <div>
            <p className="text-[13.5px] font-bold leading-tight">{other.name}</p>
            <p className="text-[11.5px] text-muted">
              {other.roleLabel}
              {other.jobTitle ? ` · ${other.jobTitle}` : ''}
              {other.bureauLabel ? ` · ${other.bureauLabel}` : ''}
            </p>
          </div>
        </div>
        <p className="hint">
          <Icon name="shield" size={12} /> Chat teks &amp; emoticon saja · edit maks 60 detik · pesan tidak dapat dihapus
        </p>
      </div>

      {/* Daftar pesan */}
      <div
        className="panel flex flex-col gap-3 overflow-y-auto p-3"
        style={{ height: '52vh', minHeight: 320 }}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {!messages.length ? (
          <p className="m-auto max-w-sm text-center text-[12.5px] text-muted">
            Belum ada pesan. Mulai percakapan dengan menuliskan informasi liputan, penugasan, atau konfirmasi naskah.
          </p>
        ) : null}

        {grouped.map((group) => (
          <div key={group.day} className="flex flex-col gap-2">
            <p className="mx-auto rounded-full border border-line bg-panel2 px-3 py-0.5 text-[10.5px] text-muted">
              {group.day}
            </p>
            {group.items.map((m) => {
              const left = editSecondsLeft(m.createdAt);
              const canEdit = m.mine && left > 0;
              const isEditing = editing?.id === m.id;
              return (
                <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex max-w-[85%] flex-col gap-1 ${m.mine ? 'items-end' : 'items-start'}`}>
                    <div
                      className="rounded-xl border px-3 py-2 text-[13px] leading-relaxed"
                      style={
                        m.mine
                          ? {
                              background: 'color-mix(in srgb, var(--accent) 14%, var(--panel))',
                              borderColor: 'color-mix(in srgb, var(--accent) 34%, var(--line))',
                            }
                          : { background: 'var(--panel-2)', borderColor: 'var(--line)' }
                      }
                    >
                      {/* Dirender sebagai teks (bukan HTML) — emoticon apa pun tetap aman */}
                      <span className="whitespace-pre-wrap break-words">{m.body}</span>
                    </div>

                    <span className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted">
                      {!m.mine ? <span className="font-semibold">{other.name}</span> : null}
                      <span>{timeOf(m.createdAt)}</span>
                      {m.editedAt ? <span>· diedit {timeOf(m.editedAt)}</span> : null}
                      {m.mine ? <span>· {m.isRead ? 'dibaca' : 'terkirim'}</span> : null}
                      {canEdit && !isEditing ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                            onClick={() => {
                              setEditing({ id: m.id, body: m.body });
                              setError('');
                            }}
                          >
                            <Icon name="edit" size={11} /> Edit ({left}s)
                          </button>
                        </>
                      ) : null}
                      {m.mine && left <= 0 && !m.editedAt ? (
                        <span className="text-muted" title="Batas waktu edit 60 detik sudah lewat">
                          · batas edit lewat
                        </span>
                      ) : null}
                    </span>

                    {isEditing ? (
                      <div className="mt-1 flex w-full flex-col gap-1.5">
                        <textarea
                          className="textarea !text-[13px]"
                          rows={2}
                          value={editing?.body ?? ''}
                          maxLength={MAX_MESSAGE_LENGTH}
                          onChange={(e) => setEditing((prev) => (prev ? { ...prev, body: e.target.value } : prev))}
                          autoFocus
                        />
                        <span className="flex items-center gap-1.5">
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => void saveEdit()}>
                            <Icon name="check" size={12} /> Simpan
                          </button>
                          <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
                            Batal
                          </button>
                          <span className="hint">Sisa {left}s</span>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Pesan & composer */}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
          <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
          {notice}
        </p>
      ) : null}

      <div className="panel flex flex-col gap-2 p-3">
        {emojiOpen ? (
          <div className="panel-soft flex flex-wrap gap-1 p-2" role="dialog" aria-label="Pilih emoticon">
            {CHAT_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-md px-1.5 py-1 text-[17px] leading-none hover:bg-panel3"
                onClick={() => insertEmoji(e)}
                aria-label={`Emoticon ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}

        <textarea
          ref={areaRef}
          className="textarea !text-[13px]"
          rows={2}
          placeholder="Tulis pesan (teks atau emoticon)…"
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setEmojiOpen((v) => !v)} aria-expanded={emojiOpen}>
            <Icon name="megaphone" size={13} /> Emoticon
          </button>
          <span className="hint">
            Enter untuk kirim · Shift+Enter baris baru · {remainingChars} karakter tersisa
          </span>
          <button
            type="button"
            className="btn btn-primary ml-auto"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
          >
            <Icon name="send" size={14} /> {sending ? 'Mengirim…' : 'Kirim'}
          </button>
        </div>
      </div>
    </div>
  );
}
