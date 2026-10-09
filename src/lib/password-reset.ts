import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';
import { genId } from './id';

/**
 * Reset kata sandi berbasis token sekali pakai.
 *
 * Alur: pengguna meminta reset → sistem membuat token acak (32 byte), menyimpan
 * **hanya hash SHA-256**-nya + masa berlaku 60 menit → token dikirim lewat email →
 * pengguna membuka /reset-password?token=… → kata sandi diganti, token ditandai terpakai.
 *
 * Token mentah TIDAK pernah disimpan, sehingga bila isi database bocor, token tetap
 * tidak dapat dipakai. Semua token lama milik pengguna dibatalkan saat reset baru dibuat.
 */

export const RESET_TOKEN_TTL_MINUTES = 60;
export const RESET_MAX_PER_HOUR = 3;

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Normalisasi token dari URL (spasi/URL-encoding sering ikut terbawa). */
export const normalizeToken = (raw: string | null | undefined) => String(raw ?? '').trim();

export type CreatedReset = { token: string; expiresAt: Date; rawTokenLength: number };

/** Buat token reset baru untuk pengguna (membatalkan token lama yang belum terpakai). */
export async function createResetToken(userId: string, ip = ''): Promise<CreatedReset> {
  const raw = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

  // Batalkan token lama yang belum dipakai (hanya satu tautan aktif per pengguna)
  await prisma.passwordReset.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.passwordReset.create({
    data: { id: genId('reset'), userId, tokenHash: hashToken(raw), expiresAt, requestIp: ip.slice(0, 60) },
  });

  return { token: raw, expiresAt, rawTokenLength: raw.length };
}

export type ResetLookup =
  | { ok: true; id: string; userId: string; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/** Cari baris token berdasarkan token mentah (perbandingan waktu aman). */
export async function findResetToken(rawToken: string): Promise<ResetLookup> {
  const raw = normalizeToken(rawToken);
  if (!/^[0-9a-f]{32,128}$/i.test(raw)) return { ok: false, reason: 'invalid' };

  const wanted = hashToken(raw);
  // Cari lewat index unik (hash) — tidak ada pencarian hash di sisi aplikasi.
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash: wanted } });
  if (!row) return { ok: false, reason: 'invalid' };

  // Perbandingan tambahan yang tahan timing attack (sabuk + pengaman)
  try {
    if (!timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(wanted))) return { ok: false, reason: 'invalid' };
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (row.usedAt) return { ok: false, reason: 'used' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, id: row.id, userId: row.userId, expiresAt: row.expiresAt };
}

/** Tandai token sudah dipakai (sekali pakai). */
export async function consumeResetToken(id: string): Promise<void> {
  await prisma.passwordReset.update({ where: { id }, data: { usedAt: new Date() } });
}

export const RESET_ERROR_TEXT: Record<'invalid' | 'expired' | 'used', string> = {
  invalid: 'Tautan reset tidak dikenali. Pastikan tautan disalin utuh dari email, atau minta tautan baru.',
  expired: `Tautan reset sudah kedaluwarsa (berlaku ${RESET_TOKEN_TTL_MINUTES} menit). Silakan minta tautan baru.`,
  used: 'Tautan reset ini sudah pernah dipakai. Silakan minta tautan baru bila perlu mengubah kata sandi lagi.',
};

/**
 * Rate limit in-memory untuk permintaan reset: 3 permintaan / jam per email+IP.
 * (Hilang saat server restart — cukup untuk mencegah penyalahgunaan dasar.)
 */
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;

export function checkResetRate(key: string): { blocked: boolean; remaining: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return { blocked: false, remaining: RESET_MAX_PER_HOUR - 1 };
  }
  entry.count += 1;
  if (entry.count > RESET_MAX_PER_HOUR) return { blocked: true, remaining: 0 };
  return { blocked: false, remaining: RESET_MAX_PER_HOUR - entry.count };
}

export const resetRateReset = (key: string) => attempts.delete(key);

/** Bersihkan token kedaluwarsa/terpakai lama (dipanggil saat membuat token baru). */
export async function pruneResetTokens(): Promise<number> {
  try {
    const res = await prisma.passwordReset.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date(Date.now() - 7 * 864e5) } }, { usedAt: { lt: new Date(Date.now() - 7 * 864e5) } }] },
    });
    return res.count;
  } catch {
    return 0;
  }
}
