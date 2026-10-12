import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { canManageBureau, canManageBureauUsers, canManageStorage, canManageUsers, canViewAudit } from '@/lib/permissions';
import type { CurrentUser } from '@/lib/session';

const ITEMS = [
  { key: 'umum', label: 'Identitas & Tampilan', href: '/dashboard/pengaturan', icon: 'cog' },
  { key: 'biro', label: 'Biro Daerah', href: '/dashboard/pengaturan/biro', icon: 'building' },
  { key: 'kategori', label: 'Kategori Berita', href: '/dashboard/pengaturan/kategori', icon: 'tag' },
  { key: 'pengguna', label: 'Pengguna & Hak Akses', href: '/dashboard/pengaturan/pengguna', icon: 'users' },
  { key: 'pengguna-biro', label: 'Akun Biro Saya', href: '/dashboard/pengaturan/pengguna-biro', icon: 'users' },
  { key: 'integrasi', label: 'Storage & Integrasi', href: '/dashboard/pengaturan/integrasi', icon: 'cloud' },
  { key: 'email', label: 'Email & Notifikasi', href: '/dashboard/pengaturan/email', icon: 'send' },
  { key: 'audit', label: 'Log Aktivitas', href: '/dashboard/pengaturan/audit', icon: 'shield' },
  { key: 'akun', label: 'Akun & Profil Saya', href: '/dashboard/akun', icon: 'user' },
];

export default function SettingsNav({ user, active }: { user: CurrentUser; active: string }) {
  const allowed = ITEMS.filter((i) => {
    if (['umum', 'login', 'biro', 'kategori', 'email'].includes(i.key)) return canManageBureau(user);
    if (i.key === 'integrasi') return canManageStorage(user);
    if (i.key === 'pengguna') return canManageUsers(user);
    if (i.key === 'pengguna-biro') return canManageBureauUsers(user);
    if (i.key === 'audit') return canViewAudit(user);
    return true;
  });

  return (
    <nav className="panel shadow-soft flex flex-wrap gap-1.5 p-2">
      {allowed.map((i) => (
        <Link key={i.key} href={i.href} className={`tab ${active === i.key ? 'active' : ''}`}>
          <Icon name={i.icon} size={14} />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
