import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { buildKey, getStorageStatus, putObject } from '@/lib/storage';
import { describeFileRejection, kindOfFile } from '@/lib/media-limits';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Jalur unggah CADANGAN: berkas dikirim ke server web lalu diteruskan ke storage.
 * Digunakan bila storage aktif adalah penyimpanan lokal, atau bila unggahan langsung
 * (pre-signed URL, /api/media/presign) gagal — mis. storage zone belum mengizinkan CORS.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const status = await getStorageStatus();
  if (!status.configured) {
    return NextResponse.json(
      {
        ok: false,
        error: `Storage belum siap dipakai: ${status.note} (Admin dapat melengkapinya di Pengaturan → Storage & Integrasi.)`,
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Permintaan unggah tidak valid.' }, { status: 400 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ ok: false, error: 'Tidak ada berkas dipilih.' }, { status: 400 });

  const results = [];
  for (const file of files) {
    const kind = kindOfFile(file.name);
    const rejection = describeFileRejection(file.name, file.size);
    if (rejection) return NextResponse.json({ ok: false, error: rejection.error }, { status: rejection.status });
    if (!kind) return NextResponse.json({ ok: false, error: `Jenis berkas "${file.name}" tidak diizinkan.` }, { status: 415 });

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const key = buildKey(file.name);
      const res = await putObject(key, buffer, file.type || 'application/octet-stream');
      results.push({
        storageKey: res.key,
        url: res.url,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        type: kind.type,
      });
    } catch (e) {
      console.error('[upload] gagal:', e);
      return NextResponse.json(
        { ok: false, error: `Gagal mengunggah "${file.name}": ${(e as Error).message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, assets: results, uploadedBy: user.id, driver: status.driver });
}
