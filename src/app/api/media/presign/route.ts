import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { canUseDirectUpload, createPresignedPut, getStorageStatus } from '@/lib/storage';
import { describeFileRejection, MAX_ATTACHMENTS } from '@/lib/media-limits';
import { prepareUpload } from '@/lib/media-upload';

export const dynamic = 'force-dynamic';

type Body = { files?: { filename?: string; size?: number; contentType?: string }[] };

/**
 * Membuat URL PUT bertanda tangan (pre-signed) agar BROWSER mengunggah berkas
 * LANGSUNG ke penyedia storage S3-compatible — byte berkas tidak pernah melewati
 * server web (penting untuk footage ratusan MB).
 *
 * Bila storage aktif adalah penyimpanan lokal (tidak ada storage eksternal), balasannya
 * `direct: false` dan klien memakai jalur lama `/api/media/upload` (lewat server).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const status = await getStorageStatus();
  if (!status.configured) {
    return NextResponse.json(
      { ok: false, error: `Storage belum siap dipakai: ${status.note} (Admin dapat melengkapinya di Pengaturan → Storage & Integrasi.)` },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Permintaan tidak valid.' }, { status: 400 });
  }

  const files = (body.files ?? []).filter((f) => f && typeof f.filename === 'string');
  if (!files.length) return NextResponse.json({ ok: false, error: 'Tidak ada berkas diminta.' }, { status: 400 });
  if (files.length > MAX_ATTACHMENTS) {
    return NextResponse.json({ ok: false, error: `Terlalu banyak berkas dalam satu permintaan (maks ${MAX_ATTACHMENTS}).` }, { status: 400 });
  }

  const capability = await canUseDirectUpload();
  if (!capability.ok) {
    // Bukan galat: klien akan memakai jalur unggah lewat server.
    return NextResponse.json({ ok: true, direct: false, reason: capability.reason });
  }

  const uploads = [];
  for (const f of files) {
    const filename = String(f.filename);
    const size = Number(f.size) || 0;
    const rejection = describeFileRejection(filename, size);
    if (rejection) return NextResponse.json({ ok: false, error: rejection.error }, { status: rejection.status });

    const prepared = prepareUpload(filename);
    if (!prepared) return NextResponse.json({ ok: false, error: `Jenis berkas "${filename}" tidak diizinkan.` }, { status: 415 });

    const contentType = (f.contentType || '').trim() || 'application/octet-stream';
    try {
      const signed = await createPresignedPut(prepared.key, contentType);
      uploads.push({
        filename,
        size,
        contentType: signed.contentType,
        type: prepared.kind.type,
        storageKey: signed.key,
        uploadUrl: signed.uploadUrl,
        expiresIn: signed.expiresIn,
      });
    } catch (e) {
      console.error('[presign] gagal membuat URL bertanda tangan:', e);
      return NextResponse.json({ ok: false, direct: false, reason: 'Gagal membuat URL bertanda tangan — memakai jalur unggah lewat server.' });
    }
  }

  return NextResponse.json({
    ok: true,
    direct: true,
    expiresIn: uploads[0]?.expiresIn ?? 900,
    uploads,
  });
}
