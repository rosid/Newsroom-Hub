import { createHmac, timingSafeEqual } from 'crypto';
import { getAppSecret } from './secret';

/**
 * Tautan berbagi bertanda tangan (signed link) untuk membagikan footage/gambar
 * kepada pengguna TAMU (mis. video editor) tanpa akun newsroom.
 *
 * Token = base64url(payload) + "." + HMAC-SHA256(payload) memakai secret aplikasi.
 * Payload memuat cakupan (satu berita atau satu berkas) dan waktu kedaluwarsa,
 * dengan masa berlaku pilihan 1 / 7 / 30 hari. Tidak ada tabel baru di database.
 */
import { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS, SHARE_EXPIRY_OPTIONS } from './share-constants';

export { SHARE_EXPIRY_OPTIONS, DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS };

/** Payload yang ditandatangani (exp = waktu kedaluwarsa dalam detik epoch). */
export type SignedShareScope =
  | { kind: 'news'; newsId: string; exp: number }
  | { kind: 'media'; storageKey: string; exp: number; filename?: string };

/** Input pembuatan token (exp diisi otomatis bila tidak diberikan). */
export type ShareScopeInput =
  | { kind: 'news'; newsId: string; exp?: number }
  | { kind: 'media'; storageKey: string; exp?: number; filename?: string };

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const signature = (payloadB64: string) =>
  b64url(createHmac('sha256', `newsroom-share::${getAppSecret()}`).update(payloadB64).digest());

export function signShareToken(scope: ShareScopeInput, days = DEFAULT_SHARE_DAYS): string {
  const d = Math.max(1, Math.min(days, MAX_SHARE_DAYS));
  const exp = scope.exp ?? Math.floor(Date.now() / 1000) + d * 86400;
  const payload = { ...scope, exp } as SignedShareScope;
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${payloadB64}.${signature(payloadB64)}`;
}

/** Verifikasi token; mengembalikan null bila tidak valid / kedaluwarsa. */
export function verifyShareToken(token: string | null | undefined): SignedShareScope | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = signature(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(payloadB64).toString('utf8')) as SignedShareScope;
    if (!payload || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < Date.now()) return null;
    if (payload.kind === 'news' && typeof payload.newsId === 'string' && payload.newsId) return payload;
    if (payload.kind === 'media' && typeof payload.storageKey === 'string' && payload.storageKey) return payload;
    return null;
  } catch {
    return null;
  }
}

/** Kunci objek yang diizinkan token untuk diakses (null = tidak diizinkan). */
export function shareAllowsKey(scope: SignedShareScope, storageKey: string, newsIdOfKey?: string | null): boolean {
  if (scope.kind === 'media') return scope.storageKey === storageKey;
  return Boolean(newsIdOfKey) && scope.newsId === newsIdOfKey;
}

export const sharePagePath = (token: string) => `/share/${token}`;

/** Path API untuk mengunduh / menampilkan berkas memakai token tamu. */
export function shareMediaPath(token: string, storageKey: string, opts: { download?: boolean } = {}): string {
  const params = new URLSearchParams({ t: token });
  if (opts.download) params.set('download', '1');
  return `/api/media/${storageKey}?${params.toString()}`;
}

/** Buang awalan UUID pada nama berkas agar nama unduhan tetap asli. */
export function originalFilename(storageKey: string, fallback?: string | null): string {
  if (fallback && fallback.trim()) return fallback.trim();
  const base = storageKey.split('/').pop() ?? 'berkas';
  return base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
}

/** Header Content-Disposition yang aman untuk nama berkas non-ASCII. */
export function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
