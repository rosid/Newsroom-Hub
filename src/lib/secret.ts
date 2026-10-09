import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';

/**
 * Secret aplikasi (dipakai untuk cookie sesi & enkripsi kredensial storage).
 * Prioritas: env SESSION_SECRET → berkas `.session-secret` (dibuat sekali) →
 * secret acak per proses (hanya bila disk tidak bisa ditulis).
 *
 * JANGAN memakai secret default hardcoded (cookie bisa dipalsukan).
 */
let cached: string | null = null;

export function getAppSecret(): string {
  if (cached) return cached;
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 32) {
    cached = env;
    return cached;
  }
  try {
    const file = `${process.cwd()}/.session-secret`;
    if (existsSync(file)) {
      const s = readFileSync(file, 'utf8').trim();
      if (s.length >= 32) {
        cached = s;
        return cached;
      }
    }
    const generated = randomBytes(32).toString('hex');
    writeFileSync(file, generated, { mode: 0o600 });
    cached = generated;
    return cached;
  } catch {
    console.warn(
      '[secret] Tidak dapat menyimpan secret ke disk — memakai secret acak per proses. Set SESSION_SECRET di environment produksi.'
    );
    cached = randomBytes(32).toString('hex');
    return cached;
  }
}
