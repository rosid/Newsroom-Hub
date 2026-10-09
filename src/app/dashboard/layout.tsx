import { requireUser } from '@/lib/session';
import { getOrgSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { MAIN_MENU, SETTINGS_MENU, ROLE_LABELS } from '@/lib/constants';
import AppShell from '@/components/layout/AppShell';
import {
  canManageBureau,
  canManageBureauUsers,
  canManageUsers,
  canViewAudit,
  newsVisibilityWhere,
} from '@/lib/permissions';
import { getChatUnreadCount } from '@/lib/chat';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [org, pendingCount, unread, chatUnread] = await Promise.all([
    getOrgSettings(),
    // hanya hitung yang boleh dilihat user (tidak membocorkan jumlah pool lain)
    prisma.news.count({ where: { AND: [newsVisibilityWhere(user), { status: 'PENDING' }] } }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    // aman bila tabel chat belum dibuat (fungsi menangani sendiri)
    getChatUnreadCount(user.id),
  ]);

  const settingsMenu = SETTINGS_MENU.filter((m) => {
    if (['umum', 'biro', 'kategori', 'email'].includes(m.key)) return canManageBureau(user);
    if (m.key === 'pengguna') return canManageUsers(user);
    if (m.key === 'pengguna-biro') return canManageBureauUsers(user);
    if (m.key === 'integrasi') return canManageBureau(user);
    if (m.key === 'audit') return canViewAudit(user);
    return true; // akun
  });

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role],
        bureauName: user.bureau?.name ?? null,
        jobTitle: user.jobTitle ?? null,
      }}
      mainMenu={MAIN_MENU.map(({ key, label, href, icon }) => ({ key, label, href, icon }))}
      settingsMenu={settingsMenu.map(({ key, label, href, icon }) => ({ key, label, href, icon }))}
      pendingCount={pendingCount}
      unreadCount={unread}
      chatUnread={chatUnread}
      siteName={org.siteName}
    >
      {children}
    </AppShell>
  );
}
