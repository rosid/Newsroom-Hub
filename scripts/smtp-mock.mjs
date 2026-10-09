/**
 * Server SMTP tiruan minimal untuk pengujian (tanpa dependensi tambahan).
 *
 * Mendukung alur yang dibutuhkan nodemailer: EHLO/HELO, MAIL FROM, RCPT TO, DATA, RSET, QUIT.
 * TIDAK mengiklankan AUTH sehingga nodemailer mengirim tanpa autentikasi (sesuai yang
 * kita konfigurasikan: relay internal tanpa kredensial).
 *
 * Pesan yang diterima disimpan di memori dan bisa diambil lewat HTTP:
 *   GET  /__messages        → daftar pesan {to, from, subject, text, html, raw}
 *   POST /__reset           → kosongkan kotak surat
 *
 *   node scripts/smtp-mock.mjs [smtpPort] [httpPort]
 */
import { createServer as createHttpServer } from 'http';
import { createServer as createTcpServer } from 'net';

const SMTP_PORT = Number(process.argv[2] || 2525);
const HTTP_PORT = Number(process.argv[3] || 2526);

/** @type {{from:string,to:string[],raw:string,subject:string,text:string,html:string}[]} */
const mailbox = [];
const stats = { connections: 0, messages: 0, errors: 0 };

const http = createHttpServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/__messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: mailbox.length, stats, messages: mailbox }));
    return;
  }
  if (url.pathname === '/__reset') {
    mailbox.length = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  res.writeHead(404);
  res.end();
});

const smtp = createTcpServer((socket) => {
  stats.connections += 1;
  let buffer = '';
  let inData = false;
  let data = '';
  let from = '';
  let recipients = [];

  socket.setEncoding('utf8');
  socket.write('220 smtp-mock siap\r\n');

  const finishMessage = () => {
    const normalize = (s) => s.replace(/\r\n\./, '\r\n').replace(/\r\n$/, '');
    const raw = normalize(data);
    const headerEnd = raw.search(/\r?\n\r?\n/);
    const headerBlock = headerEnd === -1 ? raw : raw.slice(0, headerEnd);
    let bodyBlock = headerEnd === -1 ? '' : raw.slice(headerEnd + 2);
    const subject = /^Subject:\s*(.*)$/im.exec(headerBlock)?.[1]?.trim() ?? '';

    // PENTING: nodemailer meng-encode isi email (umumnya quoted-printable, kadang base64).
    // Tanpa dekode, teks akan terpotong oleh soft line break ("=\r\n") dan karakter
    // khusus berubah jadi "=3D" — tautan reset tidak akan ditemukan.
    const encoding = /^Content-Transfer-Encoding:\s*(\S+)/im.exec(headerBlock)?.[1]?.toLowerCase() ?? '';
    if (encoding === 'quoted-printable') {
      bodyBlock = bodyBlock
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    } else if (encoding === 'base64') {
      try {
        bodyBlock = Buffer.from(bodyBlock.replace(/\s+/g, ''), 'base64').toString('utf8');
      } catch {
        /* biarkan apa adanya */
      }
    }

    // Ambil bagian HTML (kalau ada) dan teks hasil pembuangan tag
    const htmlPart = /<html[\s\S]*<\/html>/i.exec(bodyBlock)?.[0] ?? bodyBlock;
    const entities = (t) =>
      t
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    const text = entities(
      htmlPart.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    )
      .replace(/\s+/g, ' ')
      .trim();
    // Tautan diambil dari SELURUH badan pesan (termasuk atribut href) — inilah yang
    // benar-benar diklik penerima email.
    const urls = [...new Set(entities(bodyBlock).match(/https?:\/\/[^\s"'<>)]+/g) ?? [])];
    mailbox.push({ from, to: [...recipients], raw, subject, text, html: htmlPart, urls, encoding });
    stats.messages += 1;
    from = '';
    recipients = [];
    data = '';
    socket.write('250 2.0.0 OK: pesan diterima\r\n');
  };

  socket.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const idx = buffer.indexOf('\r\n');
      if (idx === -1) break;
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      if (inData) {
        if (line === '.') {
          inData = false;
          finishMessage();
        } else {
          data += `${line}\r\n`;
        }
        continue;
      }

      const cmd = line.trim();
      const upper = cmd.toUpperCase();
      if (upper.startsWith('EHLO')) {
        // Tanpa AUTH → nodemailer mengirim tanpa login (relay internal)
        socket.write('250-smtp-mock\r\n250-SIZE 52428800\r\n250-8BITMIME\r\n250 HELP\r\n');
      } else if (upper.startsWith('HELO')) {
        socket.write('250 smtp-mock\r\n');
      } else if (upper.startsWith('MAIL FROM')) {
        from = /<([^>]*)>/.exec(cmd)?.[1] ?? '';
        socket.write('250 2.1.0 OK\r\n');
      } else if (upper.startsWith('RCPT TO')) {
        recipients.push(/<([^>]*)>/.exec(cmd)?.[1] ?? '');
        socket.write('250 2.1.5 OK\r\n');
      } else if (upper === 'DATA') {
        inData = true;
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
      } else if (upper === 'RSET') {
        from = '';
        recipients = [];
        socket.write('250 2.0.0 OK\r\n');
      } else if (upper === 'NOOP') {
        socket.write('250 2.0.0 OK\r\n');
      } else if (upper === 'QUIT') {
        socket.write('221 2.0.0 Bye\r\n');
        socket.end();
      } else {
        socket.write('250 2.0.0 OK\r\n');
      }
    }
  });

  socket.on('error', () => {
    stats.errors += 1;
  });
});

smtp.listen(SMTP_PORT, () => console.log(`[smtp-mock] SMTP di 127.0.0.1:${SMTP_PORT}`));
http.listen(HTTP_PORT, () => console.log(`[smtp-mock] kotak surat HTTP di http://127.0.0.1:${HTTP_PORT}/__messages`));
