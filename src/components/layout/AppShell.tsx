'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import { logoutAction } from '@/actions/auth';
import { BASE_PATH, p } from '@/lib/base';

export type ShellUser = {
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  bureauName: string | null;
  jobTitle: string | null;
};

export type ShellMenuItem = { key: string; label: string; href: string; icon: string };

export default function AppShell({
  user,
  mainMenu,
  settingsMenu,
  pendingCount,
  unreadCount,
  chatUnread,
  siteName,
  children,
}: {
  user: ShellUser;
  mainMenu: ShellMenuItem[];
  settingsMenu: ShellMenuItem[];
  pendingCount: number;
  unreadCount: number;
  chatUnread: number;
  siteName: string;
  children: React.ReactNode;
}) {
  const rawPath = usePathname() || '/';
  const path = BASE_PATH && rawPath.startsWith(BASE_PATH) ? rawPath.slice(BASE_PATH.length) || '/' : rawPath;
  const [open, setOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  useEffect(() => {
    setOpen(false);
    setUserMenu(false);
  }, [path]);

  const isActive = (href: string) =>
    href === '/dashboard' ? path === '/dashboard' : path === href || path.startsWith(`${href}/`);

  const nav = (
    <nav className="flex flex-col gap-1">
      {mainMenu.map((m) => (
        <Link key={m.key} href={m.href} className={`nav-link ${isActive(m.href) ? 'active' : ''}`}>
          <Icon name={m.icon} size={15} />
          <span className="flex-1 truncate">{m.label}</span>
          {m.key === 'tabulasi' && pendingCount > 0 ? (
            <span className="badge badge-warn !px-1.5 !py-0">{pendingCount}</span>
          ) : null}
          {m.key === 'chat' && chatUnread > 0 ? (
            <span className="badge badge-accent !px-1.5 !py-0">{chatUnread > 99 ? '99+' : chatUnread}</span>
          ) : null}
          {m.key === 'pengaturan' ? <span className="nav-dot hidden h-1.5 w-1.5 rounded-full bg-transparent" /> : null}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-bg">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] flex-col border-r border-line bg-panel lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[13px] font-black text-white"
            style={{ background: 'var(--brand)' }}
          >
            G
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-extrabold leading-tight">{siteName}</p>
            <p className="truncate text-[10.5px] text-muted">Newsroom Hub</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 py-3">{nav}</div>
        <div className="border-t border-line p-2.5">
          <Link
            href="/dashboard/akun"
            className={`nav-link ${isActive('/dashboard/akun') ? 'active' : ''}`}
          >
            <Icon name="user" size={15} />
            <span className="truncate">Akun &amp; Profil</span>
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="nav-link w-full text-left hover:text-danger">
              <Icon name="logout" size={15} />
              <span>Keluar</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Drawer mobile */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col border-r border-line bg-panel">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="text-[13px] font-extrabold">Menu Newsroom</span>
              <button className="btn btn-icon" onClick={() => setOpen(false)} aria-label="Tutup menu">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2.5 py-3">
              {nav}
              <div className="mt-3 border-t border-line pt-3">
                <Link href="/dashboard/akun" className="nav-link">
                  <Icon name="user" size={15} />
                  <span>Akun &amp; Profil</span>
                </Link>
                <form action={logoutAction}>
                  <button type="submit" className="nav-link w-full text-left">
                    <Icon name="logout" size={15} />
                    <span>Keluar</span>
                  </button>
                </form>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[236px]">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-panel/95 px-3 backdrop-blur sm:px-4">
          <button className="btn btn-icon lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
            <Icon name="menu" size={17} />
          </button>

          <form action={p('/dashboard/tabulasi')} method="get" className="relative hidden max-w-xs flex-1 sm:block">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              name="q"
              placeholder="Cari judul, lokasi, nomor berita…"
              className="input !pl-8"
              aria-label="Cari berita"
            />
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/dashboard/kirim" className="btn btn-primary btn-sm">
              <Icon name="plus" size={14} />
              <span className="hidden sm:inline">Kirim Berita</span>
            </Link>
            <ThemeToggle />
            <NotificationBell unreadCount={unreadCount} />

            <div className="relative">
              <button
                onClick={() => setUserMenu((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-left hover:bg-panel2"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-md text-[10.5px] font-bold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  {user.name
                    .split(' ')
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join('')}
                </span>
                <span className="hidden leading-tight md:block">
                  <span className="block max-w-[130px] truncate text-[12px] font-semibold">{user.name}</span>
                  <span className="block text-[10.5px] text-muted">{user.roleLabel}</span>
                </span>
              </button>

              {userMenu ? (
                <div className="panel shadow-soft absolute right-0 top-11 z-40 w-64 p-2">
                  <div className="border-b border-line px-2 pb-2">
                    <p className="text-[12.5px] font-bold">{user.name}</p>
                    <p className="text-[11px] text-muted">{user.email}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {user.roleLabel}
                      {user.bureauName ? ` · ${user.bureauName}` : ' · Pusat'}
                    </p>
                  </div>
                  <div className="flex flex-col py-1">
                    {settingsMenu.map((m) => (
                      <Link
                        key={m.key}
                        href={m.href}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-panel2"
                      >
                        <Icon name={m.icon} size={14} className="text-muted" />
                        {m.label}
                      </Link>
                    ))}
                  </div>
                  <form action={logoutAction} className="border-t border-line pt-1">
                    <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-panel2 hover:text-danger">
                      <Icon name="logout" size={14} />
                      Keluar
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="p-3 sm:p-5">{children}</main>
      </div>
    </div>
  );
}
