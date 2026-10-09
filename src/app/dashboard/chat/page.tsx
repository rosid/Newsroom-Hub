import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getChatPartners, listConversations } from '@/lib/chat';
import { CHAT_CLUSTERS, CHAT_RULE_SUMMARIES, isChatRole } from '@/lib/chat-rules';
import { ROLE_LABELS } from '@/lib/constants';
import { formatDateTimeID, timeAgo } from '@/lib/utils';
import StartChatButton from '@/components/chat/StartChatButton';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Chat' };

export default async function ChatListPage() {
  const me = await requireUser();
  const allowed = isChatRole(me.role);

  const [conversations, partners] = allowed
    ? await Promise.all([listConversations(me), getChatPartners(me)])
    : [[], []];

  const myClusters = CHAT_CLUSTERS.filter((c) => c.roles.includes(me.role));
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  // Kontak yang belum punya percakapan (untuk memulai chat baru)
  const existing = new Set(conversations.map((c) => c.other.id));
  const freshPartners = partners.filter((p) => !existing.has(p.id));

  if (!allowed) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h1 className="text-[22px] font-extrabold tracking-tight">Chat</h1>
          <p className="mt-1 text-[12.5px] text-muted">Percakapan teks antar klaster redaksi.</p>
        </header>
        <section className="panel shadow-soft p-6">
          <Icon name="alert" size={20} className="text-muted" />
          <h2 className="mt-2 text-[15px] font-bold">Belum ada lawan chat untuk role Anda</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Chat hanya tersedia untuk pasangan role berikut:
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {CHAT_RULE_SUMMARIES.map((r) => (
              <li key={r.title} className="panel-soft p-3">
                <p className="text-[12.5px] font-bold">{r.title}</p>
                <p className="text-[12px] text-muted">{r.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Chat</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {totalUnread > 0 ? (
              <>
                <span className="badge badge-warn mr-1.5">{totalUnread} belum dibaca</span>
              </>
            ) : null}
            Klaster Anda: {myClusters.map((c) => c.label).join(' · ') || '—'}
          </p>
        </div>
      </header>

      {/* Aturan chat */}
      <section className="panel shadow-soft p-3">
        <h2 className="mb-2 flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-wider text-muted">
          <Icon name="shield" size={13} /> Aturan chat
        </h2>
        <ul className="flex flex-col gap-1.5 text-[12px] text-muted">
          {CHAT_RULE_SUMMARIES.map((r) => (
            <li key={r.title}>
              <span className="font-semibold text-ink">{r.title}</span> — {r.detail}
            </li>
          ))}
          <li className="border-t border-line pt-1.5">Pesan hanya berupa teks &amp; emoticon (tanpa gambar/berkas).</li>
          <li>Pesan dapat diedit maksimal 60 detik setelah dikirim, dan tidak dapat dihapus.</li>
          <li>Percakapan bersifat pribadi antara dua pengguna sesuai aturan di atas.</li>
        </ul>
        <p className="mt-2 text-[11.5px] text-muted">
          Kontak yang tersedia untuk Anda: <span className="font-semibold text-ink">{partners.length} orang</span>
          {myClusters.length ? ` · klaster utama: ${myClusters.map((c) => c.label).join(' · ')}` : ''}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* Daftar percakapan */}
        <section className="panel shadow-soft overflow-hidden">
          <h2 className="flex items-center justify-between border-b border-line px-3 py-2.5 text-[13.5px] font-bold">
            Percakapan
            <span className="text-[11.5px] font-medium text-muted">{conversations.length} percakapan</span>
          </h2>

          {conversations.length ? (
            <ul className="divide-y divide-[var(--line-soft)]">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/chat/${c.id}`}
                    className="flex items-start gap-3 px-3 py-3 hover:bg-panel2"
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[12px] font-bold text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      {c.other.name
                        .split(' ')
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join('')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold">{c.other.name}</span>
                        <span className="shrink-0 text-[10.5px] text-muted">
                          {c.lastMessage ? timeAgo(c.lastMessage.createdAt) : timeAgo(c.lastMessageAt)}
                        </span>
                      </span>
                      <span className="block text-[11px] text-muted">
                        {ROLE_LABELS[c.other.role]}
                        {c.other.bureau ? ` · ${c.other.bureau.name}` : ''}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="line-clamp-1 text-[12px] text-inksoft">
                          {c.lastMessage
                            ? `${c.lastMessage.senderId === me.id ? 'Anda: ' : ''}${c.lastMessage.body}`
                            : 'Belum ada pesan'}
                        </span>
                        {c.unread > 0 ? <span className="badge badge-warn shrink-0">{c.unread}</span> : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-10 text-center">
              <Icon name="send" size={20} className="mx-auto text-muted" />
              <p className="mt-2 text-[13px] font-semibold">Belum ada percakapan</p>
              <p className="text-[12px] text-muted">
                Pilih salah satu kontak di panel kanan untuk memulai percakapan sesuai klaster Anda.
              </p>
            </div>
          )}
        </section>

        {/* Kontak klaster */}
        <section className="panel shadow-soft overflow-hidden">
          <h2 className="flex items-center justify-between border-b border-line px-3 py-2.5 text-[13.5px] font-bold">
            Kontak Klaster Anda
            <span className="text-[11.5px] font-medium text-muted">{partners.length} orang</span>
          </h2>

          {partners.length ? (
            <ul className="divide-y divide-[var(--line-soft)]">
              {partners.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{p.name}</span>
                    <span className="block text-[11px] text-muted">
                      {ROLE_LABELS[p.role]}
                      {p.jobTitle ? ` · ${p.jobTitle}` : ''}
                      {p.bureau ? ` · ${p.bureau.name}` : ''}
                    </span>
                  </span>
                  <StartChatButton
                    otherId={p.id}
                    otherName={p.name}
                    label={existing.has(p.id) ? 'Buka' : 'Chat'}
                    className={`btn btn-sm ${existing.has(p.id) ? '' : 'btn-primary'}`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-8 text-center text-[12px] text-muted">
              Belum ada kontak pada klaster Anda. Hubungi admin bila ini tidak sesuai.
            </p>
          )}

          {freshPartners.length ? (
            <p className="border-t border-line px-3 py-2 text-[11.5px] text-muted">
              {freshPartners.length} kontak belum pernah dihubungi. Percakapan akan muncul di panel kiri setelah dibuka.
            </p>
          ) : null}
        </section>
      </div>

      <p className="text-[11.5px] text-muted">
        Catatan: Reporter Daerah dan Magang hanya dapat berkomunikasi dengan Produser Daerah pada{' '}
        <strong>biro yang sama</strong>; percakapan lintas biro tidak diizinkan. Redaktur, Admin, dan Super Admin
        dapat dihubungi oleh Produser Pusat, Produser Daerah, Koordinator Liputan, dan Koordinator Daerah.
      </p>
    </div>
  );
}
