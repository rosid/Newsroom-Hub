import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { deleteObject, getStorageStatus, headObject } from '@/lib/storage';
import { describeFileRejection, kindOfFile } from '@/lib/media-limits';
import { assetFromKey, isOurUploadKey } from '@/lib/media-upload';

export const dynamic = 'force-dynamic';

type Body = {
  storageKey?: string;
  filename?: string;
  size?: number;
  mimeType?: string;
};

/**
 * Memverifikasi hasil unggahan LANGSUNG ke storage (pre-signed URL) lalu mengembalikan
 * metadata aset — bentuk balasan sama dengan `/api/media/upload` supaya pemanggilnya
 * (MediaUploader) tidak perlu tahu jalur mana yang dipakai.
 *
 * Verifikasi ini WAJIB: URL bertanda tangan tidak dapat membatasi ukuran berkas, jadi
 * server memeriksa objeknya dengan HEAD (hanya metadata — byte berkasnya tidak diunduh)
 * untuk memastikan objek benar-benar ada, ukurannya diizinkan, dan key-nya memang key
 * buatan server (bukan key sembarang di bucket yang sama).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const status = await getStorageStatus();
  if (!status.configured) {
    return NextResponse.json({ ok: false, error: `Storage belum siap dipakai: ${status.note}` }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Permintaan tidak valid.' }, { status: 400 });
  }

  const filename = String(body.filename || '');
  const storageKey = String(body.storageKey || '');
  const declaredSize = Number(body.size) || 0;
  const mimeType = String(body.mimeType || '') || 'application/octet-stream';

  const kind = kindOfFile(filename);
  if (!kind) return NextResponse.json({ ok: false, error: `Jenis berkas "${filename}" tidak diizinkan.` }, { status: 415 });
  const rejection = describeFileRejection(filename, declaredSize);
  if (rejection) return NextResponse.json({ ok: false, error: rejection.error }, { status: rejection.status });

  if (!isOurUploadKey(storageKey, filename)) {
    return NextResponse.json(
      { ok: false, error: 'Key objek tidak dikenali (harus berasal dari server). Ulangi unggahan.' },
      { status: 400 }
    );
  }

  const head = await headObject(storageKey);
  if (!head) {
    return NextResponse.json(
      { ok: false, error: 'Berkas tidak ditemukan di storage — unggahan langsung mungkin gagal/terputus. Coba ulangi.' },
      { status: 404 }
    );
  }
  // Ukuran sebenarnya dari storage yang dipakai (bukan angka dari klien).
  if (head.size > kind.max) {
    await deleteObject(storageKey);
    return NextResponse.json(
      { ok: false, error: `Ukuran berkas melebihi batas ${Math.round(kind.max / 1024 / 1024)} MB — unggahan dibatalkan.` },
      { status: 413 }
    );
  }

  const asset = await assetFromKey({
    key: storageKey,
    filename,
    mimeType,
    size: head.size,
    type: kind.type,
  });

  return NextResponse.json({ ok: true, assets: [asset] });
}
