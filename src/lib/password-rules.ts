/**
 * Aturan kekuatan kata sandi — dipakai CLIENT (indikator kekuatan) dan SERVER (zod).
 * Client-safe: jangan impor prisma/next/fs di sini.
 */

export type PasswordRule = { key: string; label: string; test: (v: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'len', label: 'Minimal 8 karakter', test: (v) => v.length >= 8 },
  { key: 'upper', label: 'Ada huruf besar (A-Z)', test: (v) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'Ada huruf kecil (a-z)', test: (v) => /[a-z]/.test(v) },
  { key: 'num', label: 'Ada angka (0-9)', test: (v) => /[0-9]/.test(v) },
];

export const passwordPassed = (v: string) => PASSWORD_RULES.filter((r) => r.test(v)).length;

export const STRENGTH_LABELS = ['', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'];

/** Warna indikator kekuatan (CSS variable) sesuai jumlah aturan yang lulus. */
export const strengthColor = (passed: number) =>
  ['var(--line)', 'var(--danger)', 'var(--warn)', 'var(--ok)', 'var(--ok)'][Math.max(0, Math.min(4, passed))];
