'use server';

import { prisma } from '@/lib/prisma';
import { requireRole, requireUser } from '@/lib/session';
import { genId } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import { setSetting, getOrgSettings, getSeoSettings, getEditorialSettings, DEFAULT_ORG } from '@/lib/settings';
import {
  buildStorageSetting,
  configFromInput,
  getStorageConfig,
  testS3Config,
  testStorage,
  type StoredStorageSettings,
} from '@/lib/storage';
import type { StorageMode } from '@/lib/storage';
import {
  orgSettingsSchema,
  seoSettingsSchema,
  editorialSettingsSchema,
  bureauSchema,
  categorySchema,
  storageSettingsSchema,
  emailSettingsSchema,
  zodToState,
  type ActionState,
} from '@/lib/validations';
import { getSetting, getStoredEmailSettings, getEmailSettings, isEmailConfigured, EMAIL_PROVIDER_LABELS } from '@/lib/settings';
import { canManageStorage } from '@/lib/permissions';
import { encryptSecret } from '@/lib/crypto';
import { getMailBranding, sendMail, testEmailHtml } from '@/lib/mail';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Simpan identitas & warna tema (Setting `org`).
 *
 * PENTING: halaman Master Pengaturan memuat DUA form terpisah — "Identitas Newsroom" dan
 * "Warna Tema" — tetapi keduanya mengirim ke action yang SAMA, sementara `orgSettingsSchema`
 * memvalidasi seluruh field `org` sekaligus (siteName WAJIB + primaryColor/accentColor WAJIB).
 * Karena itu field yang TIDAK ada di form yang dikirim harus diisi dari nilai yang sudah
 * tersimpan (`formData.has`), kalau tidak form identitas gagal dengan
 * "Warna harus #RRGGBB" dan form warna gagal dengan "Nama situs minimal 3 karakter" —
 * bug yang pernah terjadi di aplikasi ini. Field yang MEMANG dikirim tetapi kosong/tidak
 * valid tetap divalidasi seperti biasa, supaya pengguna tetap diberi tahu bila mengosongkan
 * nilai wajib di form yang memuat field tersebut.
 */
export async function updateOrgSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const current = await getOrgSettings();

  // Nilai tersimpan bisa saja berasal dari data lama/tidak valid → pakai nilai bawaan sebagai jaring pengaman.
  const safeName = current.siteName.trim().length >= 3 ? current.siteName : DEFAULT_ORG.siteName;
  const safePrimary = HEX_COLOR.test(current.primaryColor) ? current.primaryColor : DEFAULT_ORG.primaryColor;
  const safeAccent = HEX_COLOR.test(current.accentColor) ? current.accentColor : DEFAULT_ORG.accentColor;

  /** Nilai dari form bila field-nya dikirim, atau nilai tersimpan bila form ini tidak memuat field tersebut. */
  const field = (name: string, fallback: string | number): string =>
    formData.has(name) ? String(formData.get(name) ?? '') : String(fallback);

  const parsed = orgSettingsSchema.safeParse({
    siteName: field('siteName', safeName),
    tagline: field('tagline', current.tagline),
    companyName: field('companyName', current.companyName),
    address: field('address', current.address),
    phone: field('phone', current.phone),
    email: field('email', current.email),
    logoUrl: field('logoUrl', current.logoUrl),
    logoWidth: field('logoWidth', current.logoWidth),
    primaryColor: field('primaryColor', safePrimary),
    accentColor: field('accentColor', safeAccent),
    defaultTheme: field('defaultTheme', current.defaultTheme),
  });
  if (!parsed.success) return zodToState(parsed.error);

  const width = Math.max(16, Math.min(320, Number(parsed.data.logoWidth) || 40));
  await setSetting('org', {
    ...current,
    ...parsed.data,
    logoWidth: width,
    secondaryColor: parsed.data.accentColor,
  });

  await logAudit({ actor: user, action: 'SETTING_ORG_UPDATE', entity: 'Setting', entityId: 'org' });
  return { ok: true, message: 'Identitas & tampilan tersimpan. Muat ulang halaman untuk melihat perubahan warna.' };
}

export async function updateSeoSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const parsed = seoSettingsSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);
  await setSetting('seo', { ...(await getSeoSettings()), ...parsed.data });
  await logAudit({ actor: user, action: 'SETTING_SEO_UPDATE', entity: 'Setting', entityId: 'seo' });
  return { ok: true, message: 'Pengaturan SEO tersimpan.' };
}

export async function updateEditorialSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const parsed = editorialSettingsSchema.safeParse({
    requireVerification: (formData.get('requireVerification') as string) ?? undefined,
    breakingAutoNotify: (formData.get('breakingAutoNotify') as string) ?? undefined,
  });
  if (!parsed.success) return zodToState(parsed.error);
  const current = await getEditorialSettings();
  await setSetting('editorial', {
    ...current,
    requireVerification: parsed.data.requireVerification === 'on',
    breakingAutoNotify: parsed.data.breakingAutoNotify === 'on',
  });
  await logAudit({ actor: user, action: 'SETTING_EDITORIAL_UPDATE', entity: 'Setting', entityId: 'editorial' });
  return { ok: true, message: 'Kebijakan redaksi tersimpan.' };
}

export async function saveBureauAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const parsed = bureauSchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    code: formData.get('code') ?? '',
    name: formData.get('name') ?? '',
    region: formData.get('region') ?? '',
    city: formData.get('city') ?? '',
    address: formData.get('address') ?? '',
    phone: formData.get('phone') ?? '',
    isActive: (formData.get('isActive') as string) ?? undefined,
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;
  const data = {
    code: d.code,
    name: d.name,
    region: d.region,
    city: d.city || null,
    address: d.address || null,
    phone: d.phone || null,
    isActive: d.isActive === 'on',
  };

  try {
    if (d.id) {
      await prisma.bureau.update({ where: { id: d.id }, data });
    } else {
      const dup = await prisma.bureau.findUnique({ where: { code: d.code } });
      if (dup) return { ok: false, error: `Kode biro "${d.code}" sudah dipakai.` };
      await prisma.bureau.create({ data: { id: genId(), ...data } });
    }
  } catch (e) {
    console.error('[bureau] gagal simpan:', e);
    return { ok: false, error: 'Gagal menyimpan data biro.' };
  }

  await logAudit({ actor: user, action: d.id ? 'BUREAU_UPDATE' : 'BUREAU_CREATE', entity: 'Bureau', entityId: d.id ?? d.code });
  return { ok: true, message: d.id ? 'Data biro diperbarui.' : `Biro ${d.name} ditambahkan.` };
}

export async function saveCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const parsed = categorySchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    name: formData.get('name') ?? '',
    color: formData.get('color') ?? '#64748b',
    sortOrder: formData.get('sortOrder') ?? '0',
    isActive: (formData.get('isActive') as string) ?? undefined,
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;
  const data = {
    name: d.name,
    color: d.color,
    sortOrder: Number(d.sortOrder) || 0,
    isActive: d.isActive === 'on',
  };
  try {
    if (d.id) {
      await prisma.category.update({ where: { id: d.id }, data });
    } else {
      const dup = await prisma.category.findUnique({ where: { name: d.name } });
      if (dup) return { ok: false, error: `Kategori "${d.name}" sudah ada.` };
      await prisma.category.create({ data: { id: genId(), ...data } });
    }
  } catch (e) {
    console.error('[category] gagal simpan:', e);
    return { ok: false, error: 'Gagal menyimpan kategori.' };
  }
  await logAudit({ actor: user, action: d.id ? 'CATEGORY_UPDATE' : 'CATEGORY_CREATE', entity: 'Category', entityId: d.id ?? d.name });
  return { ok: true, message: 'Kategori tersimpan.' };
}

export async function deleteCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const id = String(formData.get('id') || '');
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) return { ok: false, error: 'Kategori tidak ditemukan.' };
  const used = await prisma.news.count({ where: { category: cat.name } });
  if (used > 0) {
    return { ok: false, error: `Kategori dipakai oleh ${used} berita — nonaktifkan saja agar riwayat tetap utuh.` };
  }
  await prisma.category.delete({ where: { id } });
  await logAudit({ actor: user, action: 'CATEGORY_DELETE', entity: 'Category', entityId: id, meta: { name: cat.name } });
  return { ok: true, message: 'Kategori dihapus.' };
}

export async function testStorageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Wewenang dari SATU sumber kebenaran (audit A-3): halaman, menu sidebar, dan
  // ketiga action storage memakai canManageStorage yang sama.
  const actor = await requireUser();
  if (!canManageStorage(actor)) return { ok: false, error: 'Anda tidak berhak mengelola konfigurasi storage.' };
  const mode: StorageMode = String(formData.get('mode') || 'local') === 's3' ? 's3' : 'local';

  if (mode === 'local') {
    const res = await testStorage();
    await logAudit({ actor, action: 'STORAGE_TEST', entity: 'Setting', entityId: 'storage', meta: { mode, ok: res.ok } });
    return res.ok ? { ok: true, message: res.message } : { ok: false, error: res.message };
  }

  const stored = await getSetting<StoredStorageSettings>('storage', {});
  const existing = await getStorageConfig();
  const secretFromForm = String(formData.get('secretAccessKey') || '');
  const secret = secretFromForm || (stored.mode === 's3' ? existing.secretAccessKey : '');
  const cfg = configFromInput({
    mode: 's3',
    provider: String(formData.get('provider') || 'custom'),
    endpoint: String(formData.get('endpoint') || ''),
    region: String(formData.get('region') || ''),
    bucket: String(formData.get('bucket') || ''),
    accessKeyId: String(formData.get('accessKeyId') || ''),
    secretAccessKey: secret,
    publicBaseUrl: String(formData.get('publicBaseUrl') || ''),
    prefix: String(formData.get('prefix') || ''),
    forcePathStyle: formData.get('forcePathStyle') === 'on',
  });
  const res = await testS3Config(cfg);
  await logAudit({
    actor,
    action: 'STORAGE_TEST',
    entity: 'Setting',
    entityId: 'storage',
    meta: { mode, provider: cfg.provider, bucket: cfg.bucket, endpoint: cfg.endpoint, ok: res.ok },
  });
  return res.ok ? { ok: true, message: res.message } : { ok: false, error: res.message };
}

/**
 * Simpan konfigurasi storage (BunnyCDN atau penyedia S3-compatible lain).
 * Secret dienkripsi sebelum disimpan; kolom secret yang dibiarkan kosong tidak
 * menghapus kredensial yang sudah tersimpan.
 */
export async function saveStorageSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!canManageStorage(actor)) return { ok: false, error: 'Anda tidak berhak mengubah konfigurasi storage.' };
  const parsed = storageSettingsSchema.safeParse({
    mode: formData.get('mode') ?? 'local',
    provider: formData.get('provider') ?? 'custom',
    endpoint: formData.get('endpoint') ?? '',
    region: formData.get('region') ?? '',
    bucket: formData.get('bucket') ?? '',
    accessKeyId: formData.get('accessKeyId') ?? '',
    secretAccessKey: formData.get('secretAccessKey') ?? '',
    publicBaseUrl: formData.get('publicBaseUrl') ?? '',
    prefix: formData.get('prefix') ?? '',
    forcePathStyle: (formData.get('forcePathStyle') as string) ?? undefined,
    clearSecret: (formData.get('clearSecret') as string) ?? undefined,
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;

  const stored = await getSetting<StoredStorageSettings>('storage', {});
  const active = await getStorageConfig();
  const newSecret = d.clearSecret === 'on' ? '' : d.secretAccessKey.trim();
  const existingSecretEnc =
    stored.mode === 's3' && stored.provider === d.provider ? stored.secretEnc : undefined;
  const keepExisting = !newSecret && !d.clearSecret && Boolean(existingSecretEnc);

  if (d.mode === 's3' && !keepExisting && !newSecret) {
    return {
      ok: false,
      error: 'Secret Access Key wajib diisi untuk mode S3-compatible (isi ulang kredensial penyedia storage Anda).',
      fieldErrors: { secretAccessKey: 'Wajib diisi' },
    };
  }

  const setting = buildStorageSetting({
    mode: d.mode,
    provider: d.provider,
    endpoint: d.endpoint,
    region: d.region,
    bucket: d.bucket,
    accessKeyId: d.accessKeyId,
    secretAccessKey: newSecret,
    existingSecretEnc: keepExisting ? existingSecretEnc : undefined,
    publicBaseUrl: d.publicBaseUrl,
    prefix: d.prefix,
    // Path-style default aktif kecuali untuk Amazon S3 (virtual-host style).
    forcePathStyle: d.forcePathStyle === undefined ? d.provider !== 'aws' : d.forcePathStyle === 'on',
    updatedBy: actor.name,
  });

  await setSetting('storage', setting);
  await logAudit({
    actor,
    action: 'SETTING_STORAGE_UPDATE',
    entity: 'Setting',
    entityId: 'storage',
    meta: {
      mode: d.mode,
      provider: d.provider,
      bucket: d.bucket,
      endpoint: d.endpoint,
      publicBaseUrl: d.publicBaseUrl ? 'diisi' : 'kosong',
      secretChanged: Boolean(newSecret) || d.clearSecret === 'on',
      previousSource: active.source,
    },
  });

  const warnings: string[] = [];
  if (d.mode === 's3' && !d.publicBaseUrl.trim()) {
    warnings.push(
      'URL publik/CDN belum diisi — berkas akan dilayani lewat server (proxy /api/media) sehingga lebih lambat untuk footage besar.'
    );
  }
  if (d.mode === 's3' && d.publicBaseUrl && !/^https:\/\//i.test(d.publicBaseUrl.trim())) {
    warnings.push(
      'URL publik bukan HTTPS — browser dapat memblokir tampilan gambar/video. Gunakan URL HTTPS (mis. Pull Zone BunnyCDN).'
    );
  }
  if (d.mode === 'local' && stored.mode === 's3') {
    warnings.push('Berkas yang sudah ada di storage S3 sebelumnya tetap dapat diakses lewat URL-nya masing-masing.');
  }

  return {
    ok: true,
    message: [
      d.mode === 's3'
        ? `Konfigurasi storage S3 tersimpan (${d.provider}${d.bucket ? ` · ${d.bucket}` : ''}).`
        : 'Storage dikembalikan ke penyimpanan lokal (folder uploads/).',
      'Disarankan menjalankan “Uji Koneksi” untuk memastikan kredensial benar.',
      ...warnings,
    ].join(' '),
  };
}

/** Kembalikan storage ke penyimpanan lokal (folder uploads/). */
export async function resetStorageAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!canManageStorage(actor)) return { ok: false, error: 'Anda tidak berhak mengubah konfigurasi storage.' };
  const stored = await getSetting<StoredStorageSettings>('storage', {});
  await setSetting('storage', { ...stored, mode: 'local', provider: 'local', updatedAt: new Date().toISOString(), updatedBy: actor.name });
  await logAudit({ actor, action: 'SETTING_STORAGE_RESET_LOCAL', entity: 'Setting', entityId: 'storage' });
  return { ok: true, message: 'Storage diatur ulang ke penyimpanan lokal (folder uploads/).' };
}

/**
 * Simpan pengaturan email (SMTP / HTTP API).
 * Password SMTP & API key disimpan TERENKRIPSI (AES-256-GCM, kunci dari secret aplikasi);
 * kolom kosong berarti "jangan ubah nilai tersimpan".
 */
export async function saveEmailSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const parsed = emailSettingsSchema.safeParse({
    provider: formData.get('provider') ?? 'smtp',
    host: formData.get('host') ?? '',
    port: formData.get('port') ?? '587',
    user: formData.get('user') ?? '',
    pass: formData.get('pass') ?? '',
    from: formData.get('from') ?? '',
    replyTo: formData.get('replyTo') ?? '',
    secure: (formData.get('secure') as string) ?? undefined,
    apiKey: formData.get('apiKey') ?? '',
    apiBaseUrl: formData.get('apiBaseUrl') ?? '',
    clearSecret: (formData.get('clearSecret') as string) ?? undefined,
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;

  const stored = await getStoredEmailSettings();
  const clear = d.clearSecret === 'on';
  const sameProvider = stored.provider === d.provider;

  // Pertahankan rahasia lama kecuali diisi ulang atau diminta dihapus
  const keepPass = !d.pass && !clear && sameProvider && Boolean(stored.passEnc);
  const keepApiKey = !d.apiKey && !clear && sameProvider && Boolean(stored.apiKeyEnc);

  if (d.provider === 'smtp' && !keepPass && !d.pass) {
    return { ok: false, error: 'Password SMTP wajib diisi (isi ulang kredensial mail server Anda).', fieldErrors: { pass: 'Wajib diisi' } };
  }
  if (d.provider !== 'smtp' && !keepApiKey && !d.apiKey) {
    return { ok: false, error: 'API key wajib diisi untuk mode HTTP API.', fieldErrors: { apiKey: 'Wajib diisi' } };
  }

  const port = Math.max(1, Math.min(65535, Number(d.port) || 587));
  await setSetting('email', {
    provider: d.provider,
    host: d.host.trim(),
    port,
    user: d.user.trim(),
    passEnc: keepPass ? stored.passEnc : d.pass ? encryptSecret(d.pass) : '',
    from: d.from.trim(),
    replyTo: d.replyTo.trim(),
    secure: d.provider === 'smtp' ? d.secure === 'on' : true,
    apiKeyEnc: keepApiKey ? stored.apiKeyEnc : d.apiKey ? encryptSecret(d.apiKey) : '',
    apiBaseUrl: d.apiBaseUrl.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.name,
  });

  await logAudit({
    actor,
    action: 'SETTING_EMAIL_UPDATE',
    entity: 'Setting',
    entityId: 'email',
    meta: {
      provider: d.provider,
      host: d.host,
      port,
      from: d.from,
      apiBaseUrl: d.apiBaseUrl || 'bawaan',
      secretChanged: Boolean(d.pass || d.apiKey) || clear,
    },
  });

  const warnings: string[] = [];
  if (d.provider === 'smtp' && [465, 587].includes(port)) {
    warnings.push(
      'Catatan penting: pada VPS/hosting ini port SMTP 465 & 587 terbukti DIBLOKIR (koneksi timeout). Bila uji kirim gagal dengan pesan TIMEOUT, gunakan provider HTTP API (Resend/Brevo/SendGrid) yang lewat port 443, atau port SMTP lain yang diizinkan penyedia.'
    );
  }
  if (!d.from.trim()) {
    warnings.push('Alamat pengirim (From) masih kosong — sebagian penyedia email menolak pengiriman tanpa From yang sah (mis. no-reply@garuda.tv).');
  }

  return {
    ok: true,
    message: [`Pengaturan email tersimpan (${EMAIL_PROVIDER_LABELS[d.provider] ?? d.provider}).`, 'Jalankan “Kirim Email Uji” untuk memastikan pengiriman berhasil.', ...warnings].join(' '),
  };
}

/** Kirim email uji memakai pengaturan yang TERSIMPAN (bukan nilai form yang belum disimpan). */
export async function sendTestEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const to = String(formData.get('to') || actor.email).trim();

  const settings = await getEmailSettings();
  if (!isEmailConfigured(settings)) {
    return { ok: false, error: 'Pengaturan email belum lengkap. Isi dan simpan pengaturan terlebih dahulu.' };
  }

  const branding = await getMailBranding();
  const res = await sendMail({
    to,
    subject: `Uji pengiriman email ${branding.siteName}`,
    html: testEmailHtml({
      branding,
      provider: EMAIL_PROVIDER_LABELS[settings.provider] ?? settings.provider,
      at: new Date().toLocaleString('id-ID'),
    }),
  });

  await logAudit({
    actor,
    action: res.ok ? 'EMAIL_TEST_SENT' : 'EMAIL_TEST_FAILED',
    entity: 'Setting',
    entityId: 'email',
    meta: { to, provider: settings.provider, tried: res.tried?.join(', '), error: res.error?.slice(0, 200) },
  });

  if (!res.ok) {
    return {
      ok: false,
      error: `${res.error}${res.tried?.length ? ` (dicoba: ${res.tried.join(', ')})` : ''}${res.detail ? ` — detail: ${res.detail.slice(0, 160)}` : ''}`,
    };
  }
  return { ok: true, message: `Email uji terkirim ke ${to}${res.tried?.length ? ` (${res.tried.join(', ')})` : ''}. Periksa kotak masuk & folder spam.` };
}
