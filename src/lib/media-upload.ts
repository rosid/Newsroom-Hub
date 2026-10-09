import { buildKey, getStorageConfig, publicUrlFor } from './storage';
import { kindOfFile } from './media-limits';
import type { MediaType } from '@prisma/client';

/** Metadata aset hasil unggahan — bentuknya SAMA untuk jalur server maupun jalur langsung. */
export type UploadedAsset = {
  storageKey: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  type: MediaType;
};

/** Aset siap pakai dari key yang sudah tersimpan di storage. */
export async function assetFromKey(input: {
  key: string;
  filename: string;
  mimeType: string;
  size: number;
  type: MediaType;
}): Promise<UploadedAsset> {
  const cfg = await getStorageConfig();
  const publicUrl = publicUrlFor(cfg, input.key);
  return {
    storageKey: input.key,
    // Sama dengan putObject(): URL CDN bila ada, kalau tidak ditandai 's3:' dan
    // dilayani lewat /api/media/<key> (proxy server) saat dibaca.
    url: publicUrl || `s3:${input.key}`,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    type: input.type,
  };
}

/**
 * Key yang kita tanda tangani HARUS berasal dari buildKey() kita sendiri — jika tidak,
 * klien bisa meminta URL bertanda tangan untuk key sembarang (mis. menimpa objek milik
 * aplikasi lain di bucket yang sama). Cek pola tanggal + akhiran nama berkas.
 */
export function isOurUploadKey(key: string, filename: string): boolean {
  const clean = key.trim();
  if (!/^\d{4}\/\d{2}\/[0-9a-fA-F-]{8,}-\S+$/.test(clean)) return false;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return clean.endsWith(safeName);
}

/** Key baru + jenis berkas untuk satu nama berkas (dipakai jalur unggah langsung). */
export function prepareUpload(filename: string) {
  const kind = kindOfFile(filename);
  if (!kind) return null;
  return { key: buildKey(filename), kind };
}
