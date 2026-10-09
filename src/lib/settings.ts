import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from './prisma';

export type OrgSettings = {
  siteName: string;
  tagline: string;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  logoWidth: number;
  primaryColor: string;
  accentColor: string;
  defaultTheme: 'dark' | 'light';
};

export const DEFAULT_ORG: OrgSettings = {
  siteName: 'GarudaTV Newsroom Hub',
  tagline: 'Pusat Kendali Pemberitaan Nasional & Biro Daerah',
  companyName: 'PT Garuda Televisi Indonesia',
  address: '',
  phone: '',
  email: '',
  logoUrl: '',
  logoWidth: 40,
  primaryColor: '#d61f2c',
  accentColor: '#1d4ed8',
  defaultTheme: 'dark',
};

export type SeoSettings = { title: string; description: string };
export type EditorialSettings = {
  requireVerification: boolean;
  breakingAutoNotify: boolean;
  pushToCenterRoles: string[];
};

const getAllSettings = unstable_cache(
  async () => {
    try {
      const rows = await prisma.setting.findMany();
      const map: Record<string, unknown> = {};
      for (const r of rows) {
        try {
          map[r.key] = JSON.parse(r.value);
        } catch {
          map[r.key] = r.value;
        }
      }
      return map;
    } catch {
      return {} as Record<string, unknown>;
    }
  },
  ['newsroom-settings'],
  { tags: ['settings'], revalidate: 120 }
);

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const all = await getAllSettings();
  const v = all[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'object' && typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)) {
    return { ...(fallback as object), ...(v as object) } as T;
  }
  return v as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.setting.upsert({
    where: { key },
    update: { value: json },
    create: { key, value: json },
  });
  revalidateTag('settings');
}

export const getOrgSettings = () => getSetting<OrgSettings>('org', DEFAULT_ORG);

export const getSeoSettings = () =>
  getSetting<SeoSettings>('seo', {
    title: 'GarudaTV Newsroom Hub',
    description: 'Sistem pengiriman dan tabulasi berita GarudaTV — pusat & biro daerah.',
  });

export const getEditorialSettings = () =>
  getSetting<EditorialSettings>('editorial', {
    requireVerification: true,
    breakingAutoNotify: true,
    pushToCenterRoles: ['PRODUSER_DAERAH', 'REDAKTUR', 'ADMIN', 'SUPER_ADMIN'],
  });

// ===================== PENGATURAN EMAIL (SMTP / HTTP API) =====================

// Tipe & label provider diambil dari modul client-safe agar tidak ada duplikasi
import { EMAIL_PROVIDER_LABELS as PROVIDER_LABELS, type EmailProvider } from './email-providers';
export type { EmailProvider };
export const EMAIL_PROVIDER_LABELS = PROVIDER_LABELS;

/** Yang tersimpan di database: password & API key dalam keadaan TERENKRIPSI. */
export type StoredEmailSettings = {
  provider: EmailProvider;
  host: string;
  port: number;
  user: string;
  passEnc: string;
  from: string;
  secure: boolean;
  apiKeyEnc: string;
  /** Override endpoint API (untuk gateway/internal). Kosong = endpoint bawaan provider. */
  apiBaseUrl: string;
  replyTo: string;
};

export const DEFAULT_EMAIL: StoredEmailSettings = {
  provider: 'smtp',
  host: '',
  port: 587,
  user: '',
  passEnc: '',
  from: '',
  secure: false,
  apiKeyEnc: '',
  apiBaseUrl: '',
  replyTo: '',
};

export async function getStoredEmailSettings(): Promise<StoredEmailSettings> {
  const stored = await getSetting<Partial<StoredEmailSettings>>('email', {});
  return { ...DEFAULT_EMAIL, ...stored };
}

/** Pengaturan email siap pakai (secret sudah didekripsi). */
export type EmailSettings = Omit<StoredEmailSettings, 'passEnc' | 'apiKeyEnc'> & {
  pass: string;
  apiKey: string;
};

export async function getEmailSettings(): Promise<EmailSettings> {
  const s = await getStoredEmailSettings();
  const { decryptSecret } = await import('./crypto');
  const { passEnc, apiKeyEnc, ...rest } = s;
  return { ...rest, pass: decryptSecret(passEnc), apiKey: decryptSecret(apiKeyEnc) };
}

/** Email siap dipakai: mode API butuh API key; mode SMTP butuh host + user + password. */
export function isEmailConfigured(s: EmailSettings): boolean {
  if (s.provider !== 'smtp') return !!s.apiKey;
  return !!(s.host && s.user && s.pass);
}

/** Ringkasan status email untuk UI (tanpa membocorkan rahasia). */
export function describeEmail(s: EmailSettings, configured: boolean) {
  return {
    provider: s.provider,
    providerLabel: EMAIL_PROVIDER_LABELS[s.provider] ?? s.provider,
    configured,
    host: s.host,
    port: s.port,
    user: s.user,
    from: s.from,
    secure: s.secure,
    hasPass: Boolean(s.pass),
    hasApiKey: Boolean(s.apiKey),
    apiBaseUrl: s.apiBaseUrl,
    replyTo: s.replyTo,
    note: configured
      ? s.provider === 'smtp'
        ? 'Mode SMTP aktif. Bila port 465/587 diblokir hosting, gunakan provider HTTP API (Resend/Brevo/SendGrid) yang lewat port 443.'
        : `Mode ${EMAIL_PROVIDER_LABELS[s.provider]} aktif — pengiriman lewat HTTPS (port 443), aman dari pemblokiran port SMTP.`
      : s.provider === 'smtp'
        ? 'Belum lengkap: isi host, username, dan password SMTP agar email dapat dikirim.'
        : 'Belum lengkap: isi API key penyedia email agar email dapat dikirim.',
  };
}
