'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { BASE_PATH } from '@/lib/base';
import { timeAgo } from '@/lib/utils';

type Notif = {
  id: string;
  title: string;
  body: string;
  link: string;
  type: string;
  isRead: boolean;
  createdAt: string;
};

const TYPE_ICON: Record<string, string> = {
  INFO: 'bell',
  SUCCESS: 'check',
  WARNING: 'alert',
  DANGER: 'flame',
};

export default function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(unreadCount);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_PATH}/api/notifications`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setUnread(data.unread ?? 0);
      }
    } catch {
      /* diamkan */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  useEffect(() => {
    const t = setInterval(() => {
      void fetch(`${BASE_PATH}/api/notifications?countOnly=1`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setUnread(d.unread ?? 0))
        .catch(() => null);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (open && box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markAll = async () => {
    await fetch(`${BASE_PATH}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'readAll' }),
    });
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-icon relative"
        aria-label="Notifikasi"
      >
        <Icon name="bell" size={16} />
        {unread > 0 ? (
          <span
            className="absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: 'var(--brand)' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="panel shadow-soft absolute right-0 top-11 z-40 w-[330px] max-w-[86vw] overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-[12.5px] font-bold">Notifikasi</p>
            {unread > 0 ? (
              <button onClick={markAll} className="text-[11.5px] font-semibold text-accent hover:underline">
                Tandai semua dibaca
              </button>
            ) : null}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {loading && !items.length ? (
              <p className="px-3 py-6 text-center text-[12px] text-muted">Memuat…</p>
            ) : items.length ? (
              items.map((n) => {
                const body = (
                  <div className={`flex gap-2.5 px-3 py-2.5 ${n.isRead ? '' : 'bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]'}`}>
                    <Icon
                      name={TYPE_ICON[n.type] ?? 'bell'}
                      size={14}
                      className="mt-[3px] shrink-0 text-muted"
                    />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold leading-snug">{n.title}</p>
                      {n.body ? <p className="mt-0.5 text-[11.5px] text-muted">{n.body}</p> : null}
                      <p className="mt-1 text-[10.5px] text-muted">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                );
                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    className="block border-b border-linesoft last:border-0 hover:bg-panel2"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={n.id} className="border-b border-linesoft last:border-0">
                    {body}
                  </div>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-[12px] text-muted">Belum ada notifikasi.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
