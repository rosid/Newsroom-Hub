import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { getObjectStream, getStorageConfig, localObjectExists, publicUrlFor, uploadsRoot } from '@/lib/storage';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { contentDispositionAttachment, originalFilename, shareAllowsKey, verifyShareToken } from '@/lib/share';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const safeRel = (parts: string[]) =>
  parts
    .map((s) => s.replace(/[^a-zA-Z0-9._-]/g, ''))
    .filter(Boolean)
    .join('/');

/**
 * Pelayan berkas internal.
 *
 * Akses: sesi login ATAU tautan berbagi bertanda tangan `?t=<token>` (untuk tamu
 * seperti video editor, lihat src/lib/share.ts). Token hanya berlaku untuk berkas
 * yang termasuk cakupannya.
 *
 * Urutan penyajian: berkas lokal di disk (termasuk berkas lama sebelum pindah ke
 * S3) → URL publik/CDN → streaming langsung dari S3 (mendukung HTTP Range).
 *
 * `?download=1` memaksa berkas diunduh (Content-Disposition: attachment) dan
 * selalu dialirkan lewat server agar nama berkas asli terjaga, termasuk untuk
 * berkas yang tersimpan di cloud/CDN.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const url = new URL(req.url);
  const { key } = await ctx.params;
  const rel = safeRel(key || []);
  if (!rel) return NextResponse.json({ error: 'Berkas tidak ditemukan' }, { status: 404 });

  const token = url.searchParams.get('t');
  const forceDownload = url.searchParams.get('download') === '1';

  // ---- Otorisasi: sesi login atau token berbagi ----
  const user = await getCurrentUser();
  let viaToken = false;
  if (!user) {
    const scope = verifyShareToken(token);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Cari entitas pemilik berkas: dipakai untuk validasi cakupan + nama berkas asli.
    const asset = await prisma.mediaAsset.findFirst({
      where: { storageKey: rel },
      select: { newsId: true, filename: true },
    });
    if (!shareAllowsKey(scope, rel, asset?.newsId)) {
      return NextResponse.json({ error: 'Tautan berbagi tidak mencakup berkas ini' }, { status: 403 });
    }
    viaToken = true;
  }

  const cfg = await getStorageConfig();
  const asset = await prisma.mediaAsset.findFirst({
    where: { storageKey: rel },
    select: { filename: true },
  });
  const filename = originalFilename(rel, asset?.filename);

  // ---- Unduhan: selalu dialirkan lewat server agar nama berkas & header benar
  if (forceDownload) {
    const headers = new Headers({
      'Content-Type': MIME[(rel.split('.').pop() || '').toLowerCase()] ?? 'application/octet-stream',
      'Content-Disposition': contentDispositionAttachment(filename),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0, no-store',
    });

    if (await localObjectExists(rel)) {
      const target = path.join(uploadsRoot(), rel);
      const stat = await fs.stat(target);
      headers.set('Content-Length', String(stat.size));
      return new NextResponse(Readable.toWeb(createReadStream(target)) as unknown as ReadableStream, {
        status: 200,
        headers,
      });
    }

    const object = await getObjectStream(rel, req.headers.get('range') ?? undefined);
    if (object) {
      if (object.contentLength) headers.set('Content-Length', String(object.contentLength));
      return new NextResponse(object.body, { status: 200, headers });
    }
    return NextResponse.json({ error: 'Berkas tidak ditemukan' }, { status: 404 });
  }

  // ---- Pratinjau/tampilan biasa ----
  if (await localObjectExists(rel)) {
    const target = path.join(uploadsRoot(), rel);
    if (!target.startsWith(uploadsRoot())) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }
    const stat = await fs.stat(target);
    const contentType = MIME[(rel.split('.').pop() || '').toLowerCase()] ?? 'application/octet-stream';
    const headers = inlineHeaders(contentType, rel, viaToken);

    const range = req.headers.get('range');
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
        if (start >= stat.size || start > end) {
          return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
        }
        headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        headers.set('Content-Length', String(end - start + 1));
        const stream = createReadStream(target, { start, end });
        return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, { status: 206, headers });
      }
    }
    headers.set('Content-Length', String(stat.size));
    return new NextResponse(Readable.toWeb(createReadStream(target)) as unknown as ReadableStream, {
      status: 200,
      headers,
    });
  }

  // Pengguna internal (login) boleh dilayani langsung dari CDN (cepat).
  // Akses TAMU (token) sengaja selalu lewat server agar URL CDN permanen tidak
  // terekspos dan akses tetap sepenuhnya dikendalikan token (bisa kedaluwarsa).
  if (!viaToken) {
    const publicUrl = publicUrlFor(cfg, rel);
    if (publicUrl) return NextResponse.redirect(publicUrl, 302);
  }

  const object = await getObjectStream(rel, req.headers.get('range') ?? undefined);
  if (object) {
    const headers = inlineHeaders(object.contentType, rel, viaToken);
    if (object.contentRange) headers.set('Content-Range', object.contentRange);
    if (object.contentLength) headers.set('Content-Length', String(object.contentLength));
    return new NextResponse(object.body, { status: object.contentRange ? 206 : 200, headers });
  }

  return NextResponse.json({ error: 'Berkas tidak ditemukan' }, { status: 404 });
}

function inlineHeaders(contentType: string, rel: string, viaToken: boolean): Headers {
  const headers = new Headers({
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    // Tautan tamu bersifat publik-terbatas -> jangan disimpan di cache bersama
    'Cache-Control': viaToken ? 'private, max-age=600' : 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  });
  if (!contentType.startsWith('image/')) {
    // Berkas non-gambar tidak dieksekusi browser (mitigasi XSS lewat unggahan)
    headers.set('Content-Disposition', `inline; filename="${path.basename(rel)}"`);
    headers.set('Content-Security-Policy', "sandbox; default-src 'none'");
  }
  return headers;
}
