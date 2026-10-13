/**
 * LOGIN THROTTLING — pembatas percobaan masuk yang dapat diatur dari panel.
 *
 * In-memory (per proses): cukup untuk mencegah brute force dasar dan tidak butuh Redis.
 * Keterbatasan yang disadari: hitungannya hilang saat server restart, dan tidak dibagi antar
 * proses (aplikasi ini berjalan satu proses). Untuk skala lebih besar, ganti penyimpanannya
 * (mis. Redis) tanpa mengubah pemanggilnya.
 *
 * Dipisahkan ke modul sendiri agar bisa diuji unit tanpa menjalankan server.
 */

export type ThrottleConfig = {
  /** Jumlah percobaan yang diizinkan dalam satu jendela waktu. */
  maxAttempts: number;
  /** Panjang jendela waktu (menit). */
  windowMinutes: number;
  /** Lama blokir setelah melewati batas (menit). */
  blockMinutes: number;
};

type Entry = { count: number; firstAt: number; blockedUntil: number };

const attempts = new Map<string, Entry>();

/** Bersihkan entri lama agar Map tidak tumbuh tanpa batas (dipanggil otomatis). */
function prune(now: number, cfg: ThrottleConfig): void {
  if (attempts.size < 500) return;
  const windowMs = cfg.windowMinutes * 60_000;
  for (const [key, e] of attempts) {
    if (e.blockedUntil < now && now - e.firstAt > windowMs) attempts.delete(key);
  }
}

export type ThrottleResult = {
  blocked: boolean;
  remaining: number;
  /** Menit tersisa sampai blokir berakhir (hanya saat blocked). */
  retryAfterMinutes: number;
};

/**
 * Periksa & catat satu percobaan untuk `key` (biasanya `email|ip`).
 * Mengembalikan status setelah percobaan ini dihitung.
 */
export function checkThrottle(key: string, cfg: ThrottleConfig, now = Date.now()): ThrottleResult {
  const windowMs = Math.max(1, cfg.windowMinutes) * 60_000;
  const blockMs = Math.max(1, cfg.blockMinutes) * 60_000;
  const max = Math.max(1, cfg.maxAttempts);
  prune(now, cfg);

  const entry = attempts.get(key);

  // Masih dalam masa blokir
  if (entry && entry.blockedUntil > now) {
    return { blocked: true, remaining: 0, retryAfterMinutes: Math.ceil((entry.blockedUntil - now) / 60_000) };
  }

  // Belum ada entri, atau jendela sudah lewat -> mulai jendela baru
  if (!entry || now - entry.firstAt > windowMs) {
    attempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return { blocked: false, remaining: max - 1, retryAfterMinutes: 0 };
  }

  entry.count += 1;
  if (entry.count > max) {
    entry.blockedUntil = now + blockMs;
    return { blocked: true, remaining: 0, retryAfterMinutes: Math.ceil(blockMs / 60_000) };
  }
  return { blocked: false, remaining: max - entry.count, retryAfterMinutes: 0 };
}

/** Hapus hitungan untuk satu key (dipanggil setelah login berhasil). */
export function resetThrottle(key: string): void {
  attempts.delete(key);
}

/** Hanya untuk pengujian: kosongkan seluruh hitungan. */
export function clearAllThrottle(): void {
  attempts.clear();
}

/** Pesan yang ditampilkan saat diblokir (menyebut sisa waktu bila diketahui). */
export function throttleMessage(retryAfterMinutes: number): string {
  const menit = Math.max(1, Math.ceil(retryAfterMinutes));
  return `Terlalu banyak percobaan masuk. Coba lagi dalam ${menit} menit.`;
}
