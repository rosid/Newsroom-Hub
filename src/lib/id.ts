import { randomUUID } from 'crypto';

/** Semua model memakai id String (manual, bukan autoincrement). */
export const genId = (prefix = ''): string => (prefix ? `${prefix}_${randomUUID()}` : randomUUID());

/** Nomor berita: NB-YYYYMMDD-#### */
export const genNewsCode = (seq: number, date = new Date()): string => {
  const d = new Date(date);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `NB-${ymd}-${String(seq).padStart(4, '0')}`;
};
