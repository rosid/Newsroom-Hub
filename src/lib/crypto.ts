import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getAppSecret } from './secret';

/**
 * Enkripsi simetris (AES-256-GCM) untuk kredensial storage yang disimpan di
 * database (mis. Secret Access Key). Kunci diturunkan dari secret aplikasi,
 * jadi kredensial tidak terbaca langsung dari isi database.
 *
 * Format hasil: `v1:<iv-b64>:<tag-b64>:<cipher-b64>`
 */
const PREFIX = 'v1';

function key(): Buffer {
  // Panjang kunci tetap 32 byte (AES-256) dari secret aplikasi apa pun panjangnya.
  return createHash('sha256').update(`newsroom-storage::${getAppSecret()}`).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [PREFIX, iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
  } catch (e) {
    console.warn('[crypto] gagal mengenkripsi kredensial:', (e as Error).message);
    return '';
  }
}

export function decryptSecret(payload: string | undefined | null): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    // Nilai lama/di luar skema enkripsi — kembalikan apa adanya (migrasi mulus).
    return payload;
  }
  try {
    const [, iv, tag, data] = parts;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.warn(
      '[crypto] gagal mendekripsi kredensial storage (kemungkinan SESSION_SECRET berubah). Isi ulang kredensial di Pengaturan → Storage & Integrasi.'
    );
    return '';
  }
}

export const isEncrypted = (v: string | undefined | null) => Boolean(v && v.startsWith(`${PREFIX}:`));

/** Sembunyikan nilai rahasia untuk ditampilkan di UI. */
export function maskSecret(v: string): string {
  if (!v) return '';
  if (v.length <= 6) return '••••••';
  return `${v.slice(0, 2)}••••••${v.slice(-2)}`;
}
