/**
 * Batas & jenis berkas lampiran — dipakai SERVER (route unggah) dan CLIENT
 * (validasi awal di MediaUploader) supaya keduanya tidak pernah berbeda.
 * File ini tidak boleh mengimpor apa pun dari server (prisma/next/fs).
 */
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
export const VIDEO_EXT = ['mp4', 'webm', 'mov'];
export const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip'];

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300 MB (footage)
export const MAX_DOC_BYTES = 50 * 1024 * 1024; // 50 MB

/** Batas jumlah lampiran per berita (ditegakkan di server action). */
export const MAX_ATTACHMENTS = 40;

export const ACCEPT_ATTR = 'video/*,image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip';

export type MediaKind = 'IMAGE' | 'FOOTAGE';

export type FileCheck =
  | { ok: true; kind: MediaKind; maxBytes: number; label: string }
  | { ok: false; error: string };

export const extensionOf = (filename: string) => (filename.split('.').pop() || '').toLowerCase();

export const formatBytesID = (n: number): string => {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** Validasi jenis & ukuran berkas sebelum diunggah (pesan langsung ke pengguna). */
export function checkFile(filename: string, size: number): FileCheck {
  const ext = extensionOf(filename);
  if (VIDEO_EXT.includes(ext)) {
    if (size > MAX_VIDEO_BYTES) {
      return { ok: false, error: `Footage lebih dari ${formatBytesID(MAX_VIDEO_BYTES)} — kompres dulu atau unggah sebagian.` };
    }
    return { ok: true, kind: 'FOOTAGE', maxBytes: MAX_VIDEO_BYTES, label: 'Footage video' };
  }
  if (IMAGE_EXT.includes(ext)) {
    if (size > MAX_IMAGE_BYTES) return { ok: false, error: `Gambar lebih dari ${formatBytesID(MAX_IMAGE_BYTES)}.` };
    return { ok: true, kind: 'IMAGE', maxBytes: MAX_IMAGE_BYTES, label: 'Gambar' };
  }
  if (DOC_EXT.includes(ext)) {
    if (size > MAX_DOC_BYTES) return { ok: false, error: `Dokumen lebih dari ${formatBytesID(MAX_DOC_BYTES)}.` };
    return { ok: true, kind: 'FOOTAGE', maxBytes: MAX_DOC_BYTES, label: 'Dokumen' };
  }
  return {
    ok: false,
    error: `Jenis berkas .${ext || '?'} tidak diizinkan (video mp4/webm/mov, gambar jpg/png/webp/gif/svg, dokumen pdf/doc/docx/xls/xlsx/csv/txt/zip).`,
  };
}

/** Ringkasan jenis berkas untuk label di UI. */
export const kindLabel = (mimeType: string, filename: string): string => {
  const ext = extensionOf(filename);
  if (mimeType.startsWith('video/') || VIDEO_EXT.includes(ext)) return 'Footage video';
  if (mimeType.startsWith('image/') || IMAGE_EXT.includes(ext)) return 'Gambar';
  return 'Dokumen';
};

/**
 * Klasifikasi berkas untuk jalur unggah server (dipakai bersama oleh route
 * unggah lewat server DAN route pembuat URL bertanda tangan) agar batas jenis/ukuran
 * hanya didefinisikan sekali.
 */
export function kindOfFile(filename: string): { type: MediaKind; max: number; ext: string } | null {
  const ext = extensionOf(filename);
  if (IMAGE_EXT.includes(ext)) return { type: 'IMAGE', max: MAX_IMAGE_BYTES, ext };
  if (VIDEO_EXT.includes(ext)) return { type: 'FOOTAGE', max: MAX_VIDEO_BYTES, ext };
  if (DOC_EXT.includes(ext)) return { type: 'FOOTAGE', max: MAX_DOC_BYTES, ext };
  return null;
}

/** Pesan galat untuk berkas yang tidak lolos klasifikasi/ukuran (dipakai beberapa route). */
export function describeFileRejection(filename: string, size: number): { status: number; error: string } | null {
  const kind = kindOfFile(filename);
  if (!kind) {
    return {
      status: 415,
      error: `Jenis berkas "${filename}" tidak diizinkan (gambar, video, atau dokumen saja).`,
    };
  }
  if (size > kind.max) {
    return {
      status: 413,
      error: `Ukuran "${filename}" melebihi batas ${Math.round(kind.max / 1024 / 1024)} MB.`,
    };
  }
  return null;
}

