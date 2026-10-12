// PENTING: hanya `import type` — file ini dipakai juga oleh komponen client.
// Mengimpor nilai runtime dari @prisma/client akan menarik Prisma ke bundle browser.
import type { Role, NewsStatus, NewsKind, Pool, AnnouncementPriority } from '@prisma/client';

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin Redaksi',
  REDAKTUR: 'Redaktur',
  PRODUSER_PUSAT: 'Produser Pusat',
  REPORTER_PUSAT: 'Reporter Pusat',
  PRODUSER_DAERAH: 'Produser Daerah',
  REPORTER_DAERAH: 'Reporter Daerah',
  KONTRIBUTOR: 'Kontributor',
  MAGANG: 'Magang',
  KOORDINATOR_LIPUTAN: 'Koordinator Liputan',
  KOORDINATOR_DAERAH: 'Koordinator Daerah',
};

export const ROLE_SCOPE: Record<Role, 'PUSAT' | 'DAERAH' | 'SEMUA'> = {
  SUPER_ADMIN: 'SEMUA',
  ADMIN: 'SEMUA',
  REDAKTUR: 'PUSAT',
  PRODUSER_PUSAT: 'PUSAT',
  REPORTER_PUSAT: 'PUSAT',
  PRODUSER_DAERAH: 'DAERAH',
  REPORTER_DAERAH: 'DAERAH',
  KONTRIBUTOR: 'DAERAH',
  MAGANG: 'DAERAH',
  // Hak akses setara Produser Pusat (sesuai permintaan)
  KOORDINATOR_LIPUTAN: 'PUSAT',
  KOORDINATOR_DAERAH: 'PUSAT',
};

export const ALL_ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'REDAKTUR',
  'PRODUSER_PUSAT',
  'REPORTER_PUSAT',
  'PRODUSER_DAERAH',
  'REPORTER_DAERAH',
  'KONTRIBUTOR',
  'MAGANG',
  'KOORDINATOR_LIPUTAN',
  'KOORDINATOR_DAERAH',
];

export const STATUS_LABELS: Record<NewsStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Menunggu Persetujuan',
  REVISION: 'Perlu Revisi',
  VERIFIED: 'Terverifikasi',
  REJECTED: 'Ditolak',
  PUBLISHED: 'Disiarkan',
};

/** Kelas Tailwind badge per status (dipakai bersama di tabel & detail). */
export const STATUS_BADGE: Record<NewsStatus, string> = {
  DRAFT: 'badge badge-muted',
  PENDING: 'badge badge-warn',
  REVISION: 'badge badge-info',
  VERIFIED: 'badge badge-ok',
  REJECTED: 'badge badge-danger',
  PUBLISHED: 'badge badge-brand',
};

// Label jenis berita diambil dari SATU sumber (src/lib/news-kinds.ts) agar tidak bisa
// berbeda antara form, filter, badge, ekspor, dan notifikasi.
export { KIND_LABELS, KIND_SHORT } from './news-kinds';
import { KIND_LABELS as REGISTRY_KIND_LABELS } from './news-kinds';

/**
 * Jaminan kelengkapan saat COMPILE: bila enum `NewsKind` bertambah (mis. jenis berita baru)
 * tetapi `news-kinds.ts` belum diperbarui, baris di bawah ini GAGAL di type-check —
 * bukan diam-diam tampil tanpa label.
 */
type KindMissingFromRegistry = Exclude<NewsKind, keyof typeof REGISTRY_KIND_LABELS>;
const _allKindsRegistered: [KindMissingFromRegistry] extends [never]
  ? true
  : ['JENIS BERITA BELUM TERDAFTAR di src/lib/news-kinds.ts', KindMissingFromRegistry] = true;
void _allKindsRegistered;

export const POOL_LABELS: Record<Pool, string> = {
  PUSAT: 'Pool Pusat',
  DAERAH: 'Pool Daerah',
};

export const PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  NORMAL: 'Normal',
  PENTING: 'Penting',
  URGENT: 'Urgent',
};

export const PRIORITY_BADGE: Record<AnnouncementPriority, string> = {
  NORMAL: 'badge badge-muted',
  PENTING: 'badge badge-warn',
  URGENT: 'badge badge-danger',
};

/** Urutan status untuk progress bar di halaman detail. */
export const STATUS_FLOW: NewsStatus[] = ['DRAFT', 'PENDING', 'VERIFIED', 'PUBLISHED'];

export const CATEGORY_FALLBACK = 'Umum';

/** Kanal tayang (penyiaran) sebuah berita. */
export type AirChannel = 'ONAIR' | 'MEDSOS';

export const AIR_CHANNELS: AirChannel[] = ['ONAIR', 'MEDSOS'];

export const AIR_CHANNEL_LABELS: Record<AirChannel, string> = {
  ONAIR: 'Tayang Onair',
  MEDSOS: 'Tayang Medsos',
};

export const AIR_CHANNEL_SHORT: Record<AirChannel, string> = {
  ONAIR: 'Onair',
  MEDSOS: 'Medsos',
};

/** Warna chip/badge kanal tayang. */
export const AIR_CHANNEL_BADGE: Record<AirChannel, string> = {
  ONAIR: 'badge badge-brand',
  MEDSOS: 'badge badge-accent',
};

/** Kelas CSS kanal (dipakai grafik & legenda). */
export const AIR_CHANNEL_COLOR: Record<AirChannel, string> = {
  ONAIR: '#d61f2c',
  MEDSOS: '#4d7cfe',
};

// Menu utama aplikasi (sidebar). `show` dihitung dari izin user.
export type MenuItem = {
  key: string;
  label: string;
  href: string;
  icon: string;
  badgeFrom?: 'pending' | 'announcements' | 'notifications' | 'chat';
};

export const MAIN_MENU: MenuItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { key: 'tabulasi', label: 'Tabulasi Berita', href: '/dashboard/tabulasi', icon: 'list' },
  { key: 'listing', label: 'Listing Berita', href: '/dashboard/listing', icon: 'rows' },
  { key: 'kirim', label: 'Kirim Berita', href: '/dashboard/kirim', icon: 'send' },
  { key: 'chat', label: 'Chat', href: '/dashboard/chat', icon: 'chat' },
  { key: 'peta', label: 'Peta Sebaran Berita', href: '/dashboard/peta', icon: 'map' },
  { key: 'laporan', label: 'Laporan', href: '/dashboard/laporan', icon: 'chart' },
  { key: 'pengumuman', label: 'Pengumuman', href: '/dashboard/pengumuman', icon: 'megaphone' },
  { key: 'pengaturan', label: 'Pengaturan', href: '/dashboard/pengaturan', icon: 'cog' },
];

export const SETTINGS_MENU = [
  { key: 'umum', label: 'Identitas & Tampilan', href: '/dashboard/pengaturan', icon: 'cog' },
  { key: 'login', label: 'Halaman Login', href: '/dashboard/pengaturan/login', icon: 'eye' },
  { key: 'biro', label: 'Biro Daerah', href: '/dashboard/pengaturan/biro', icon: 'building' },
  { key: 'kategori', label: 'Kategori Berita', href: '/dashboard/pengaturan/kategori', icon: 'tag' },
  { key: 'pengguna', label: 'Pengguna & Hak Akses', href: '/dashboard/pengaturan/pengguna', icon: 'users' },
  { key: 'pengguna-biro', label: 'Akun Biro Saya', href: '/dashboard/pengaturan/pengguna-biro', icon: 'users' },
  { key: 'integrasi', label: 'Storage & Integrasi', href: '/dashboard/pengaturan/integrasi', icon: 'cloud' },
  { key: 'email', label: 'Email & Notifikasi', href: '/dashboard/pengaturan/email', icon: 'send' },
  { key: 'audit', label: 'Log Aktivitas', href: '/dashboard/pengaturan/audit', icon: 'shield' },
  { key: 'akun', label: 'Akun & Profil Saya', href: '/dashboard/akun', icon: 'user' },
];

/**
 * Ubah daftar role menjadi teks yang enak dibaca, mis. "Reporter Daerah, Magang, dan Kontributor".
 * Dipakai di pesan galat server maupun keterangan halaman agar selalu mengikuti daftar role
 * yang benar-benar diizinkan (tidak ada label yang tertinggal saat daftarnya berubah).
 */
export function roleListText(roles: Role[], conjunction = 'dan'): string {
  const labels = roles.map((r) => ROLE_LABELS[r] ?? String(r));
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} ${conjunction} ${labels[1]}`;
  // 3 item atau lebih: pakai koma sebelum kata sambung ("A, B, dan C")
  return `${labels.slice(0, -1).join(', ')}, ${conjunction} ${labels[labels.length - 1]}`;
}
