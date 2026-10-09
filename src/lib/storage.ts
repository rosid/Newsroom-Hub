import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import type { Readable } from 'stream';
import { p } from './base';
import { getSetting } from './settings';
import { decryptSecret, encryptSecret, maskSecret } from './crypto';

/**
 * Abstraksi storage footage/gambar.
 *
 * Dua mode:
 * - `local` : berkas disimpan di folder `uploads/` lalu dilayani route
 *   /api/media/[...key] (mendukung HTTP Range, video bisa di-seek).
 * - `s3`    : penyedia apa pun yang S3-compatible (BunnyCDN, Cloudflare R2,
 *   Amazon S3, DigitalOcean Spaces, Wasabi, B2, MinIO, …).
 *
 * Sumber konfigurasi (urutan prioritas):
 * 1. Setting `storage` di database — diatur admin lewat Pengaturan → Storage & Integrasi.
 * 2. Variabel environment (STORAGE_DRIVER + BUNNY_* / S3_*) — untuk infra-as-code.
 * 3. Mode `local` (default aman).
 */
export type StorageMode = 'local' | 's3';

export type StorageConfig = {
  mode: StorageMode;
  provider: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  prefix: string;
  forcePathStyle: boolean;
  source: 'database' | 'env' | 'default';
};

/** Bentuk data yang disimpan di Setting `storage` (secret dalam keadaan terenkripsi). */
export type StoredStorageSettings = {
  mode?: StorageMode;
  provider?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretEnc?: string;
  publicBaseUrl?: string;
  prefix?: string;
  forcePathStyle?: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_PREFIX = 'newsroom';

const trimmed = (v: string | undefined, fallback = '') => (v ?? '').trim() || fallback;
const stripSlash = (v: string) => v.replace(/\/+$/, '');

/** Konfigurasi dari environment (kompatibel dengan BUNNY_* lama maupun S3_* generik). */
function envConfig(): StorageConfig {
  const driver = (process.env.STORAGE_DRIVER || '').toLowerCase();
  const mode: StorageMode = driver === 'bunny' || driver === 's3' ? 's3' : driver === 'local' ? 'local' : 'local';
  const bucket = trimmed(process.env.S3_BUCKET) || trimmed(process.env.BUNNY_STORAGE_ZONE);
  const endpoint = stripSlash(trimmed(process.env.S3_ENDPOINT) || trimmed(process.env.BUNNY_STORAGE_ENDPOINT));
  const accessKeyId = trimmed(process.env.S3_ACCESS_KEY_ID) || bucket;
  const secretAccessKey = trimmed(process.env.S3_SECRET_ACCESS_KEY) || trimmed(process.env.BUNNY_STORAGE_ACCESS_KEY);
  const publicBaseUrl = stripSlash(trimmed(process.env.S3_PUBLIC_URL) || trimmed(process.env.BUNNY_CDN_URL));
  const prefix = trimmed(process.env.S3_PREFIX) || trimmed(process.env.BUNNY_STORAGE_PREFIX, DEFAULT_PREFIX);
  const forcePathStyle =
    process.env.S3_FORCE_PATH_STYLE !== undefined
      ? process.env.S3_FORCE_PATH_STYLE === 'true'
      : true; // Bunny/MinIO/Wasabi/R2 umumnya butuh path-style
  const provider = trimmed(process.env.S3_PROVIDER) || (process.env.BUNNY_STORAGE_ZONE ? 'bunny' : 'custom');

  return {
    mode,
    provider: mode === 'local' ? 'local' : provider,
    endpoint,
    region: trimmed(process.env.S3_REGION) || trimmed(process.env.BUNNY_STORAGE_REGION, 'us-east-1'),
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
    prefix: prefix || DEFAULT_PREFIX,
    forcePathStyle,
    source: 'env',
  };
}

function hasS3Credentials(c: { bucket: string; accessKeyId: string; secretAccessKey: string; endpoint: string; provider: string }) {
  if (!c.bucket || !c.accessKeyId || !c.secretAccessKey) return false;
  // Endpoint boleh kosong hanya untuk AWS (memakai endpoint bawaan SDK).
  if (!c.endpoint && c.provider !== 'aws') return false;
  return true;
}

/** Konfigurasi aktif (database → environment → lokal). */
export async function getStorageConfig(): Promise<StorageConfig> {
  const stored = await getSetting<StoredStorageSettings>('storage', {});
  if (stored && stored.mode) {
    const mode: StorageMode = stored.mode === 's3' ? 's3' : 'local';
    return {
      mode,
      provider: mode === 'local' ? 'local' : trimmed(stored.provider, 'custom'),
      endpoint: stripSlash(trimmed(stored.endpoint)),
      region: trimmed(stored.region, 'us-east-1'),
      bucket: trimmed(stored.bucket),
      accessKeyId: trimmed(stored.accessKeyId),
      secretAccessKey: mode === 's3' ? decryptSecret(stored.secretEnc) : '',
      publicBaseUrl: stripSlash(trimmed(stored.publicBaseUrl)),
      prefix: trimmed(stored.prefix, DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ''),
      forcePathStyle: stored.forcePathStyle !== false,
      source: 'database',
    };
  }
  return envConfig();
}

export type StorageStatus = {
  mode: StorageMode;
  /** Nama teknis yang ditampilkan (mis. 's3:bunny' atau 'local'). */
  driver: string;
  provider: string;
  configured: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyIdMasked: string;
  hasSecret: boolean;
  publicBaseUrl: string;
  prefix: string;
  forcePathStyle: boolean;
  source: StorageConfig['source'];
  note: string;
};

export function describeConfig(cfg: StorageConfig): StorageStatus {
  const configured = cfg.mode === 'local' ? true : hasS3Credentials(cfg);
  let note: string;
  if (cfg.mode === 'local') {
    note = 'Berkas tersimpan di disk server (folder uploads/) dan dilayani endpoint internal /api/media. Untuk produksi disarankan memakai storage S3-compatible agar disk server tidak penuh.';
  } else if (!configured) {
    const missing = [
      !cfg.bucket ? 'bucket/storage zone' : '',
      !cfg.accessKeyId ? 'Access Key ID' : '',
      !cfg.secretAccessKey ? 'Secret Access Key' : '',
      !cfg.endpoint && cfg.provider !== 'aws' ? 'endpoint' : '',
    ].filter(Boolean);
    note = `Konfigurasi S3 belum lengkap: ${missing.join(', ')} belum diisi — unggahan akan gagal sampai dilengkapi.`;
  } else if (!cfg.publicBaseUrl) {
    note =
      'S3 aktif, tetapi URL publik/CDN belum diisi. Berkas tetap dapat diunggah dan akan dilayani lewat server (proxy /api/media) — lebih lambat untuk footage besar. Disarankan mengisi URL Pull Zone/CDN.';
  } else {
    note = 'S3-compatible aktif — berkas footage/gambar diunggah langsung ke penyedia storage dan disajikan melalui URL publik/CDN.';
  }
  return {
    mode: cfg.mode,
    driver: cfg.mode === 'local' ? 'local' : `s3:${cfg.provider}`,
    provider: cfg.provider,
    configured,
    endpoint: cfg.endpoint || (cfg.provider === 'aws' ? `https://s3.${cfg.region}.amazonaws.com` : ''),
    region: cfg.region,
    bucket: cfg.bucket,
    accessKeyIdMasked: maskSecret(cfg.accessKeyId),
    hasSecret: Boolean(cfg.secretAccessKey),
    publicBaseUrl: cfg.publicBaseUrl,
    prefix: cfg.prefix,
    forcePathStyle: cfg.forcePathStyle,
    source: cfg.source,
    note,
  };
}

export async function getStorageStatus(): Promise<StorageStatus> {
  return describeConfig(await getStorageConfig());
}

/** Susun data Setting `storage` dari nilai form (secret dienkripsi). */
export function buildStorageSetting(input: {
  mode: StorageMode;
  provider: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey?: string;
  /** Secret yang sudah tersimpan — dipakai bila kolom secret dibiarkan kosong. */
  existingSecretEnc?: string;
  publicBaseUrl: string;
  prefix: string;
  forcePathStyle: boolean;
  updatedBy?: string;
}): StoredStorageSettings {
  const secretEnc = input.secretAccessKey
    ? encryptSecret(input.secretAccessKey)
    : input.existingSecretEnc ?? '';
  return {
    mode: input.mode,
    provider: input.provider,
    endpoint: stripSlash(input.endpoint.trim()),
    region: input.region.trim() || 'us-east-1',
    bucket: input.bucket.trim(),
    accessKeyId: input.accessKeyId.trim(),
    secretEnc,
    publicBaseUrl: stripSlash(input.publicBaseUrl.trim()),
    prefix: (input.prefix.trim() || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ''),
    forcePathStyle: input.forcePathStyle,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? '',
  };
}

/**
 * Folder penyimpanan lokal. Dapat dialihkan lewat MEDIA_UPLOAD_DIR — dipakai uji
 * otomatis agar TIDAK menulis ke folder `uploads/` milik aplikasi (folder bersama).
 */
export const uploadsRoot = () =>
  process.env.MEDIA_UPLOAD_DIR
    ? path.resolve(process.env.MEDIA_UPLOAD_DIR)
    : path.join(process.cwd(), 'uploads');

const sanitizeKey = (key: string) =>
  key
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..')
    .map((s) => s.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .join('/');

export type PutResult = { key: string; url: string; filename: string };

/** Bangun key unik: <prefix>/<yyyy>/<mm>/<uuid>-<namafile> */
export function buildKey(filename: string): string {
  const now = new Date();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const uniq =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return [String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), `${uniq}-${safe}`].join('/');
}

/**
 * Prefix disimpan per-konfigurasi, jadi disisipkan saat menulis/membaca objek.
 * IDEMPOTEN: berkas lama (diunggah sebelum prefix dipindah ke konfigurasi) sudah
 * memuat prefix pada storageKey-nya — tanpa penjagaan ini, key tersebut menjadi
 * "prefix/prefix/..." dan berkas lama tidak lagi ditemukan (404).
 */
const withPrefix = (cfg: StorageConfig, key: string) => {
  const clean = sanitizeKey(key);
  const p = cfg.prefix.replace(/^\/+|\/+$/g, '');
  if (!p) return clean;
  return clean === p || clean.startsWith(`${p}/`) ? clean : `${p}/${clean}`;
};

async function s3Client(cfg: StorageConfig) {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<PutResult> {
  const cfg = await getStorageConfig();
  const clean = sanitizeKey(key);

  if (cfg.mode === 's3') {
    if (!hasS3Credentials(cfg)) {
      throw new Error(
        'Konfigurasi storage S3 belum lengkap. Lengkapi di Pengaturan → Storage & Integrasi (bucket/zone, access key, secret key, endpoint).'
      );
    }
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3Client(cfg);
    const objectKey = withPrefix(cfg, clean);
    await client.send(
      new PutObjectCommand({ Bucket: cfg.bucket, Key: objectKey, Body: body, ContentType: contentType })
    );
    const url = cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/${objectKey}` : `s3:${objectKey}`;
    return { key: clean, url, filename: path.basename(clean) };
  }

  const target = path.join(uploadsRoot(), clean);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body);
  return { key: clean, url: `local:${clean}`, filename: path.basename(clean) };
}

export async function deleteObject(key: string): Promise<void> {
  const cfg = await getStorageConfig();
  const clean = sanitizeKey(key);
  if (cfg.mode === 's3' && hasS3Credentials(cfg)) {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await s3Client(cfg);
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: withPrefix(cfg, clean) }));
    } catch (e) {
      console.warn('[storage] gagal menghapus objek S3:', (e as Error).message);
    }
    return;
  }
  try {
    await fs.unlink(path.join(uploadsRoot(), clean));
  } catch {
    /* file mungkin sudah tidak ada */
  }
}

/** True bila berkas ada di disk server (dipakai untuk kompatibilitas berkas lama). */
export async function localObjectExists(key: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(uploadsRoot(), sanitizeKey(key)));
    return stat.isFile();
  } catch {
    return false;
  }
}

export type ObjectStream = {
  body: ReadableStream;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
};

/**
 * Ambil objek dari penyedia S3 (dipakai bila URL publik/CDN tidak dikonfigurasi
 * sehingga berkas dilayani lewat server; mendukung HTTP Range).
 */
export async function getObjectStream(key: string, range?: string): Promise<ObjectStream | null> {
  const cfg = await getStorageConfig();
  if (cfg.mode !== 's3' || !hasS3Credentials(cfg)) return null;
  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3Client(cfg);
    const res = await client.send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: withPrefix(cfg, key), ...(range ? { Range: range } : {}) })
    );
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream() as ReadableStream,
      contentType: res.ContentType ?? 'application/octet-stream',
      contentLength: res.ContentLength,
      contentRange: res.ContentRange,
    };
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name !== 'NoSuchKey' && name !== 'NotFound') {
      console.warn('[storage] gagal mengambil objek dari S3:', (e as Error).message);
    }
    return null;
  }
}

/** URL yang siap dipakai di <img>/<video src> (basePath sudah diterapkan). */
export function mediaSrc(asset: { storageKey: string; url?: string | null }): string {
  const url = asset.url || '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return p(`/api/media/${asset.storageKey}`);
}

// ============ UNGGAHAN LANGSUNG KE STORAGE (PRE-SIGNED URL) ============
/**
 * Agar footage besar (ratusan MB) TIDAK melewati server web: server hanya
 * menandatangani URL (SigV4) lalu BROWSER mengunggah berkasnya langsung ke
 * penyedia storage S3-compatible. Server web tidak pernah menerima byte berkasnya.
 *
 * Syarat: mode storage = s3 dan kredensial lengkap. Untuk mode lokal, tidak ada
 * storage eksternal sehingga unggahan tetap lewat server (satu-satunya cara).
 * Storage zone/bucket WAJIB mengizinkan CORS (PUT + header Content-Type) dari
 * origin aplikasi — bila tidak, browser memblokir unggahan langsung dan
 * MediaUploader otomatis memakai jalur lama (lewat server) sebagai cadangan.
 */
export type PresignedPut = {
  /** Key TANPA prefix (disimpan di MediaAsset.storageKey, sama seperti putObject). */
  key: string;
  /** URL bertanda tangan untuk PUT langsung ke storage (sudah termasuk prefix). */
  uploadUrl: string;
  /** Nama objek di storage (dengan prefix) — berguna untuk diagnosis. */
  objectKey: string;
  /** Header yang WAJIB dikirim persis sama (ikut ditandatangani). */
  contentType: string;
  expiresIn: number;
};

/** True bila unggahan langsung (pre-signed) memungkinkan dengan konfigurasi sekarang. */
export async function canUseDirectUpload(): Promise<{ ok: boolean; reason: string }> {
  const cfg = await getStorageConfig();
  if (cfg.mode !== 's3') {
    return { ok: false, reason: 'Storage aktif adalah penyimpanan lokal server — unggahan melewati server (mode lokal tidak punya storage eksternal).' };
  }
  if (!hasS3Credentials(cfg)) {
    return { ok: false, reason: 'Konfigurasi S3 belum lengkap sehingga URL bertanda tangan tidak dapat dibuat.' };
  }
  return { ok: true, reason: 'URL bertanda tangan (pre-signed) tersedia — berkas diunggah langsung ke storage.' };
}

/** Buat URL PUT bertanda tangan untuk satu objek (hanya berlaku di mode S3). */
export async function createPresignedPut(
  key: string,
  contentType: string,
  expiresIn = 900
): Promise<PresignedPut> {
  const cfg = await getStorageConfig();
  if (cfg.mode !== 's3' || !hasS3Credentials(cfg)) {
    throw new Error('Unggahan langsung hanya tersedia pada mode storage S3-compatible.');
  }
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = await s3Client(cfg);
  const clean = sanitizeKey(key);
  const objectKey = withPrefix(cfg, clean);
  const type = contentType || 'application/octet-stream';

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: cfg.bucket, Key: objectKey, ContentType: type }),
    // Content-Type ikut ditandatangani → header ini wajib dikirim sama persis oleh browser.
    { expiresIn, signableHeaders: new Set(['content-type']) }
  );

  return { key: clean, uploadUrl, objectKey, contentType: type, expiresIn };
}

/** Ukuran & tipe objek di storage (untuk memverifikasi unggahan langsung). */
export async function headObject(key: string): Promise<{ size: number; contentType: string } | null> {
  const cfg = await getStorageConfig();
  if (cfg.mode !== 's3' || !hasS3Credentials(cfg)) return null;
  try {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3Client(cfg);
    const res = await client.send(
      new HeadObjectCommand({ Bucket: cfg.bucket, Key: withPrefix(cfg, sanitizeKey(key)) })
    );
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? 'application/octet-stream' };
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name !== 'NotFound' && name !== 'NoSuchKey' && name !== '403') {
      console.warn('[storage] gagal membaca metadata objek S3:', (e as Error).message);
    }
    return null;
  }
}

/** Pesan error S3 yang mudah dipahami operator. */
export function describeStorageError(e: unknown): string {
  const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const status = err?.$metadata?.httpStatusCode;
  const name = err?.name ?? 'StorageError';
  if (name === 'InvalidAccessKeyId' || name === 'SignatureDoesNotMatch' || status === 403) {
    return 'Ditolak oleh penyedia storage (403). Periksa Access Key ID & Secret Access Key (khusus BunnyCDN: Access Key ID = nama Storage Zone).';
  }
  if (name === 'NoSuchBucket' || status === 404) {
    return 'Bucket/storage zone tidak ditemukan (404). Periksa nama bucket dan endpoint (region) yang dipakai.';
  }
  if (name === 'ENOTFOUND' || name === 'EAI_AGAIN' || (err?.message ?? '').includes('getaddrinfo')) {
    return 'Endpoint tidak dapat dihubungi (DNS gagal). Periksa penulisan URL endpoint storage.';
  }
  if (name === 'ECONNREFUSED' || name === 'ETIMEDOUT' || name === 'TimeoutError') {
    return 'Koneksi ke endpoint storage gagal/timeout. Pastikan server storage dapat diakses dari VPS ini.';
  }
  return `${name}${status ? ` (HTTP ${status})` : ''}: ${err?.message ?? 'tidak diketahui'}`;
}

/** Uji tulis–baca–hapus objek untuk memastikan konfigurasi benar-benar bekerja. */
export async function testStorage(): Promise<{ ok: boolean; message: string }> {
  const cfg = await getStorageConfig();
  const label = cfg.mode === 'local' ? 'penyimpanan lokal (folder uploads/)' : `${cfg.provider.toUpperCase()} · ${cfg.bucket} @ ${cfg.endpoint || `s3.${cfg.region}.amazonaws.com`}`;
  const key = buildKey('uji-koneksi.txt');
  try {
    const payload = `uji koneksi ${new Date().toISOString()}`;
    const res = await putObject(key, Buffer.from(payload), 'text/plain');
    if (cfg.mode === 's3') {
      // Pastikan objek benar-benar bisa dibaca kembali dari storage.
      const stream = await getObjectStream(res.key);
      if (!stream) {
        await deleteObject(res.key);
        return { ok: false, message: `Unggah berhasil, tetapi objek tidak dapat dibaca kembali dari ${label}. Periksa izin baca (GetObject) pada kredensial tersebut.` };
      }
      await stream.body.cancel();
    }
    await deleteObject(res.key);
    return {
      ok: true,
      message: `Berhasil menulis, membaca, dan menghapus objek uji di ${label}. Objek: ${res.key}`,
    };
  } catch (e) {
    return { ok: false, message: `Uji koneksi gagal — ${describeStorageError(e)}` };
  }
}

/** Uji konfigurasi kandidat (dipakai tombol "Uji Koneksi" sebelum disimpan). */
export async function testS3Config(cfg: StorageConfig): Promise<{ ok: boolean; message: string }> {
  const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  if (!hasS3Credentials(cfg)) {
    return { ok: false, message: 'Lengkapi bucket/zone, Access Key ID, Secret Access Key, dan endpoint terlebih dahulu.' };
  }
  const objectKey = withPrefix(cfg, buildKey('uji-koneksi.txt'));
  const label = `${cfg.provider.toUpperCase()} · ${cfg.bucket} @ ${cfg.endpoint || `s3.${cfg.region}.amazonaws.com`}`;
  try {
    const client = await s3Client(cfg);
    await client.send(
      new PutObjectCommand({ Bucket: cfg.bucket, Key: objectKey, Body: Buffer.from('uji koneksi'), ContentType: 'text/plain' })
    );
    await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey }));
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: objectKey }));
    return { ok: true, message: `Koneksi berhasil (tulis → baca → hapus) ke ${label}.` };
  } catch (e) {
    return { ok: false, message: `Uji koneksi gagal — ${describeStorageError(e)}` };
  }
}

/** Bangun objek config dari nilai form (untuk uji sebelum simpan). */
export function configFromInput(input: {
  mode: StorageMode;
  provider: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  prefix: string;
  forcePathStyle: boolean;
}): StorageConfig {
  return {
    mode: input.mode,
    provider: input.provider,
    endpoint: stripSlash(input.endpoint.trim()),
    region: input.region.trim() || 'us-east-1',
    bucket: input.bucket.trim(),
    accessKeyId: input.accessKeyId.trim(),
    secretAccessKey: input.secretAccessKey,
    publicBaseUrl: stripSlash(input.publicBaseUrl.trim()),
    prefix: (input.prefix.trim() || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ''),
    forcePathStyle: input.forcePathStyle,
    source: 'database',
  };
}

/** URL publik objek (memperhitungkan prefix). Kosong bila CDN belum dikonfigurasi. */
export function publicUrlFor(cfg: StorageConfig, key: string): string {
  if (!cfg.publicBaseUrl) return '';
  return `${cfg.publicBaseUrl}/${withPrefix(cfg, key)}`;
}

export const createReadStreamForLocal = (key: string) => createReadStream(path.join(uploadsRoot(), sanitizeKey(key)));
