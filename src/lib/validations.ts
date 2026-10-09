import { z } from 'zod';
import { PASSWORD_RULES } from './password-rules';

/** String tanggal opsional: kosong = tidak diisi (menghindari error "format tanggal tidak valid"). */
const optionalDate = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid')])
  .optional();

const optionalCoord = z
  .union([z.literal(''), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  });

export const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Sandi wajib diisi'),
});

/**
 * Aturan sandi kuat. Urutan pengecekan disusun dari aturan bersama
 * (`PASSWORD_RULES`) agar pesan validator server selalu sama dengan checklist di UI.
 */
export const strongPassword = z
  .string()
  .min(8, PASSWORD_RULES[0].label)
  .regex(/[A-Z]/, PASSWORD_RULES[1].label)
  .regex(/[a-z]/, PASSWORD_RULES[2].label)
  .regex(/[0-9]/, PASSWORD_RULES[3].label);

export const newsFormSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(8, 'Judul minimal 8 karakter').max(240, 'Judul maksimal 240 karakter'),
  script: z.string().trim().min(20, 'Naskah minimal 20 karakter'),
  summary: z.string().trim().max(400).optional().default(''),
  category: z.string().trim().min(1, 'Kategori wajib dipilih'),
  kind: z.enum(['REGULAR', 'BREAKING']).default('REGULAR'),
  location: z.string().trim().min(3, 'Lokasi minimal 3 karakter'),
  province: z.string().trim().optional().default(''),
  city: z.string().trim().optional().default(''),
  latitude: optionalCoord,
  longitude: optionalCoord,
  tags: z.string().optional().default(''),
  submit: z.enum(['draft', 'submit']).default('submit'),
  // daftar media yang sudah diunggah (JSON array dari client)
  media: z.string().optional().default('[]'),
});

export const reviewNewsSchema = z
  .object({
    newsId: z.string().min(1),
    status: z.enum(['VERIFIED', 'REVISION', 'REJECTED']),
    note: z.string().trim().optional().default(''),
  })
  .refine((d) => d.status === 'VERIFIED' || d.note.length >= 3, {
    message: 'Alasan wajib diisi (minimal 3 karakter) bila tidak diverifikasi',
    path: ['note'],
  });

export const pushToCenterSchema = z.object({
  newsId: z.string().min(1),
  note: z.string().trim().optional().default(''),
  isNational: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
});

export const publishNewsSchema = z.object({
  newsId: z.string().min(1),
  note: z.string().trim().optional().default(''),
  isNational: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
});

export const airNewsSchema = z.object({
  newsId: z.string().min(1),
  channel: z.enum(['ONAIR', 'MEDSOS']),
  note: z.string().trim().optional().default(''),
  isNational: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
});

export const retractAirSchema = z.object({
  newsId: z.string().min(1),
  channel: z.enum(['ONAIR', 'MEDSOS']),
  note: z.string().trim().optional().default(''),
});

export const deleteNewsSchema = z.object({ newsId: z.string().min(1) });

export const bureauSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(2, 'Kode minimal 2 karakter').max(8, 'Kode maksimal 8 karakter').toUpperCase(),
  name: z.string().trim().min(3, 'Nama biro minimal 3 karakter'),
  region: z.string().trim().min(3, 'Provinsi/wilayah wajib diisi'),
  city: z.string().trim().optional().default(''),
  address: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
  isActive: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
});

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, 'Nama kategori minimal 2 karakter'),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus format #RRGGBB').default('#64748b'),
  sortOrder: z.string().optional().default('0'),
  isActive: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(3, 'Nama minimal 3 karakter'),
  email: z.string().trim().toLowerCase().email('Email tidak valid'),
  role: z.enum([
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
  ]),
  bureauId: z.string().optional().default(''),
  jobTitle: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
  password: strongPassword,
});

export const userUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(3, 'Nama minimal 3 karakter'),
  role: z.enum([
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
  ]),
  bureauId: z.string().optional().default(''),
  jobTitle: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
  isActive: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
  newPassword: z.union([z.literal(''), strongPassword]).optional().default(''),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Sandi saat ini wajib diisi'),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1, 'Konfirmasi sandi wajib diisi'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Konfirmasi sandi tidak sama',
    path: ['confirmPassword'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'Sandi baru tidak boleh sama dengan sandi lama',
    path: ['newPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email tidak valid'),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(16, 'Tautan reset tidak valid'),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1, 'Konfirmasi sandi wajib diisi'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Konfirmasi sandi tidak sama',
    path: ['confirmPassword'],
  });

export const emailSettingsSchema = z
  .object({
    provider: z.enum(['smtp', 'resend', 'brevo', 'sendgrid']).default('smtp'),
    host: z.string().trim().optional().default(''),
    port: z.string().trim().optional().default('587'),
    user: z.string().trim().optional().default(''),
    pass: z.string().optional().default(''),
    from: z.string().trim().optional().default(''),
    replyTo: z.union([z.literal(''), z.string().trim().email('Reply-To bukan email yang valid')]).optional().default(''),
    secure: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
    apiKey: z.string().optional().default(''),
    apiBaseUrl: z.union([z.literal(''), z.string().trim().url('URL API tidak valid (contoh: https://api.contoh.com)')]).optional().default(''),
    clearSecret: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
  })
  .refine((d) => d.provider !== 'smtp' || Boolean(d.host.trim()), {
    message: 'Host SMTP wajib diisi untuk mode SMTP.',
    path: ['host'],
  })
  .refine((d) => d.provider !== 'smtp' || Boolean(d.user.trim()), {
    message: 'Username SMTP wajib diisi untuk mode SMTP.',
    path: ['user'],
  })
  .refine((d) => d.provider === 'smtp' || Boolean(d.apiKey) || d.clearSecret !== 'on', {
    message: 'API key wajib diisi untuk mode HTTP API.',
    path: ['apiKey'],
  })
  .refine((d) => d.from.trim() === '' || /^([^<]+<)?[^\s@<]+@[^\s@>]+>?$/.test(d.from.trim()), {
    message: 'Alamat pengirim (From) tidak valid — contoh: Newsroom <no-reply@garuda.tv>',
    path: ['from'],
  });

export const accountProfileSchema = z.object({
  name: z.string().trim().min(3, 'Nama minimal 3 karakter'),
  phone: z.string().trim().optional().default(''),
  jobTitle: z.string().trim().optional().default(''),
  avatarUrl: z.string().trim().optional().default(''),
});

export const announcementSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(5, 'Judul minimal 5 karakter'),
  body: z.string().trim().min(10, 'Isi pengumuman minimal 10 karakter'),
  priority: z.enum(['NORMAL', 'PENTING', 'URGENT']).default('NORMAL'),
  audience: z.string().trim().default('ALL'),
  targetBureauId: z.string().optional().default(''),
  isActive: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
  expiresAt: optionalDate,
});

export const orgSettingsSchema = z.object({
  siteName: z.string().trim().min(3, 'Nama situs minimal 3 karakter'),
  tagline: z.string().trim().optional().default(''),
  companyName: z.string().trim().optional().default(''),
  address: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
  email: z.string().trim().optional().default(''),
  logoUrl: z.string().trim().optional().default(''),
  logoWidth: z.string().optional().default('40'),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus #RRGGBB'),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus #RRGGBB'),
  defaultTheme: z.enum(['dark', 'light']).default('dark'),
});

export const seoSettingsSchema = z.object({
  title: z.string().trim().min(3, 'Judul SEO minimal 3 karakter'),
  description: z.string().trim().max(300).optional().default(''),
});

export const storageSettingsSchema = z
  .object({
    mode: z.enum(['local', 's3']).default('local'),
    provider: z.string().trim().default('custom'),
    endpoint: z.string().trim().optional().default(''),
    region: z.string().trim().optional().default(''),
    bucket: z.string().trim().optional().default(''),
    accessKeyId: z.string().trim().optional().default(''),
    secretAccessKey: z.string().optional().default(''),
    publicBaseUrl: z
      .union([z.literal(''), z.string().trim().url('URL publik tidak valid (contoh: https://cdn.example.com)')])
      .optional()
      .default(''),
    prefix: z.string().trim().optional().default(''),
    forcePathStyle: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
    clearSecret: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
  })
  .refine((d) => d.mode !== 's3' || Boolean(d.bucket.trim()), {
    message: 'Nama bucket / Storage Zone wajib diisi untuk mode S3-compatible.',
    path: ['bucket'],
  })
  .refine((d) => d.mode !== 's3' || Boolean(d.accessKeyId.trim()), {
    message: 'Access Key ID wajib diisi untuk mode S3-compatible.',
    path: ['accessKeyId'],
  })
  .refine((d) => d.mode !== 's3' || d.provider === 'aws' || Boolean(d.endpoint.trim()), {
    message: 'Endpoint wajib diisi (kecuali memakai Amazon S3 dengan endpoint bawaan).',
    path: ['endpoint'],
  })
  .refine((d) => d.mode !== 's3' || !d.endpoint.trim() || /^https?:\/\//i.test(d.endpoint.trim()), {
    message: 'Endpoint harus diawali http:// atau https://',
    path: ['endpoint'],
  });

export const editorialSettingsSchema = z.object({
  requireVerification: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
  breakingAutoNotify: z.union([z.literal('on'), z.literal(''), z.undefined()]).optional(),
});

/** Ubah FormData menjadi objek biasa (semua nilai string). */
export function formToObject(fd: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string') obj[k] = v;
  }
  return obj;
}

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> };

export function zodToState(err: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: err.issues[0]?.message ?? 'Data tidak valid', fieldErrors };
}
