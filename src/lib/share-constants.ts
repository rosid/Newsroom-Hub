/**
 * Konstanta berbagi tautan — dipakai server (src/lib/share.ts) DAN komponen client
 * (form pengaturan/berbagi), jadi file ini TIDAK boleh mengimpor crypto/fs/prisma.
 */
export const SHARE_EXPIRY_OPTIONS = [
  { days: 1, label: '1 hari' },
  { days: 7, label: '7 hari' },
  { days: 30, label: '30 hari' },
] as const;

export const DEFAULT_SHARE_DAYS = 7;
export const MAX_SHARE_DAYS = 90;
