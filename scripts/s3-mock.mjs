/**
 * Mock server S3-compatible minimal (path-style) untuk pengujian driver storage.
 * Mendukung: PUT (upload), GET (unduh + HTTP Range), HEAD, DELETE, preflight CORS
 * (OPTIONS), dan endpoint statistik `/__stats` agar uji dapat memverifikasi bahwa
 * driver benar-benar berbicara dengan server S3.
 *
 * Mode CORS:
 *   CORS=off  → tidak mengirim header CORS sama sekali (mensimulasikan storage zone
 *               yang belum mengizinkan CORS) sehingga unggahan langsung dari browser
 *               GAGAL dan aplikasi harus mundur ke jalur lewat server.
 *   CORS=on   → mengizinkan PUT + header Content-Type dari origin mana pun
 *               (perilaku storage zone yang sudah dikonfigurasi benar).
 *
 * Mode TLS (opsional, dipakai uji pre-signed):
 *   TLS_CERT=... TLS_KEY=...  → server berjalan sebagai HTTPS. Perlu karena CSP aplikasi
 *               hanya mengizinkan koneksi browser ke https:, sehingga uji jalur unggahan
 *               langsung harus memakai HTTPS (seperti BunnyCDN/S3 sungguhan).
 *
 * Catatan: mock ini TIDAK memvalidasi tanda tangan AWS SigV4 — tujuannya menguji
 * alur unggah/baca/hapus objek (bucket, key, prefix, content-type, range) dan
 * keberadaan parameter tanda tangan pada URL pre-signed.
 *
 *   CORS=on node scripts/s3-mock.mjs [port] [dir]
 */
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { promises as fs, readFileSync } from 'fs';
import path from 'path';

const PORT = Number(process.argv[2] || 9100);
const ROOT = process.argv[3] || '/tmp/newsroom-s3';
const CORS = (process.env.CORS || 'on') !== 'off';
const TLS_CERT = process.env.TLS_CERT || '';
const TLS_KEY = process.env.TLS_KEY || '';

const stats = { put: 0, get: 0, head: 0, delete: 0, errors: 0, options: 0, corsBlocked: 0, signedUrls: [], lastKeys: [] };

const safeRel = (p) =>
  decodeURIComponent(p)
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..')
    .join('/');

const xmlError = (code, status, message) =>
  `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;

/** Header CORS hanya dikirim bila mode CORS aktif (meniru storage zone tanpa CORS). */
const corsHeaders = (req) =>
  CORS
    ? {
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Methods': 'PUT,GET,HEAD,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,x-amz-*',
        'Access-Control-Max-Age': '600',
      }
    : {};

const handler = async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts[0] === '__stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }
  if (parts[0] === '__reset') {
    stats.put = stats.get = stats.head = stats.delete = stats.errors = 0;
    stats.options = 0;
    stats.corsBlocked = 0;
    stats.signedUrls = [];
    stats.lastKeys = [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  // Preflight CORS (dikirim browser sebelum PUT dengan header Content-Type)
  if (req.method === 'OPTIONS') {
    stats.options += 1;
    if (!CORS) {
      stats.corsBlocked += 1;
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  const [bucket, ...rest] = parts;
  const key = safeRel(rest.join('/'));
  if (!bucket || !key) {
    stats.errors += 1;
    res.writeHead(400, { 'Content-Type': 'application/xml' });
    res.end(xmlError('InvalidRequest', 400, 'bucket/key tidak lengkap'));
    return;
  }
  const file = path.join(ROOT, bucket, key);
  // Catat parameter tanda tangan (SigV4) bila ada — dipakai uji untuk memastikan
  // permintaan datang dari URL pre-signed, bukan dari SDK di sisi server.
  if (url.searchParams.has('X-Amz-Signature')) {
    stats.signedUrls.push({
      method: req.method,
      key: `${bucket}/${key}`,
      expires: url.searchParams.get('X-Amz-Expires'),
      hasCredential: url.searchParams.has('X-Amz-Credential'),
      hasContentTypeHeader: url.searchParams.get('X-Amz-SignedHeaders') || '',
    });
  }

  try {
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
      stats.put += 1;
      stats.lastKeys.push(`PUT ${bucket}/${key} (${body.length}B)`);
      res.writeHead(200, { ETag: `"${body.length.toString(16)}"`, 'x-amz-request-id': 'mock', ...corsHeaders(req) });
      res.end();
      return;
    }

    if (req.method === 'DELETE') {
      await fs.unlink(file).catch(() => null);
      stats.delete += 1;
      stats.lastKeys.push(`DELETE ${bucket}/${key}`);
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    // GET / HEAD
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      stats.errors += 1;
      res.writeHead(404, { 'Content-Type': 'application/xml', ...corsHeaders(req) });
      res.end(xmlError('NoSuchKey', 404, 'objek tidak ditemukan'));
      return;
    }

    const range = req.headers.range;
    const headers = {
      'Content-Type': key.endsWith('.png')
        ? 'image/png'
        : key.endsWith('.mp4')
          ? 'video/mp4'
          : key.endsWith('.txt')
            ? 'text/plain'
            : 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Last-Modified': stat.mtime.toUTCString(),
      ETag: `"${stat.size.toString(16)}"`,
    };

    if (req.method === 'HEAD') {
      stats.head += 1;
      res.writeHead(200, { ...headers, 'Content-Length': String(stat.size), ...corsHeaders(req) });
      res.end();
      return;
    }

    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        start = m[1] ? Number(m[1]) : 0;
        end = m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
    }
    const buf = await fs.readFile(file);
    stats.get += 1;
    stats.lastKeys.push(`GET ${bucket}/${key} (${status})`);
    res.writeHead(status, { ...headers, 'Content-Length': String(end - start + 1), ...corsHeaders(req) });
    res.end(buf.subarray(start, end + 1));
  } catch (e) {
    stats.errors += 1;
    res.writeHead(500, { 'Content-Type': 'application/xml' });
    res.end(xmlError('InternalError', 500, e.message));
  }
};

await fs.mkdir(ROOT, { recursive: true });
const schemed = TLS_CERT && TLS_KEY;
const server = schemed
  ? createHttpsServer({ cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) }, handler)
  : createHttpServer(handler);

server.listen(PORT, () =>
  console.log(
    `[s3-mock] siap di ${schemed ? 'https' : 'http'}://127.0.0.1:${PORT} (root: ${ROOT}, CORS: ${CORS ? 'on' : 'off'})`
  )
);
