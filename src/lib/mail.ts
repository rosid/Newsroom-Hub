import nodemailer from 'nodemailer';
import { headers } from 'next/headers';
import { getEmailSettings, isEmailConfigured, getOrgSettings, type EmailSettings } from './settings';
import { BASE_PATH } from './base';

/**
 * Pengiriman email (SMTP atau HTTP API).
 *
 * PELAJARAN DARI APLIKASI LAIN (GarudaTV Magang Center, di server yang sama):
 * server platform ini MEMBLOKIR port SMTP 465 & 587 (gejala: ETIMEDOUT). Bukti waktu itu:
 * permintaan ke HTTP API Brevo dengan API key dummy menjawab `HTTP_401 Key not found`,
 * artinya koneksi HTTPS/443 berhasil sedangkan SMTP tidak. Karena itu mode **HTTP API**
 * (Resend/Brevo/SendGrid) disediakan sebagai jalur utama yang disarankan di produksi,
 * sementara SMTP tetap didukung untuk mail server internal/VPS yang portnya terbuka.
 */

export type MailResult = { ok: boolean; error?: string; detail?: string; tried?: string[] };

/** URL absolut untuk tautan di email (mengikuti host permintaan + basePath). */
export async function buildAbsoluteUrl(path: string): Promise<string> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
    const proto = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(host) ? 'http' : 'https';
    return `${proto}://${host}${BASE_PATH}${path}`;
  } catch {
    return `${BASE_PATH}${path}`;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Ambil alamat email dari "Nama <email@domain>" atau "email@domain"; null bila tidak valid. */
export function extractEmail(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : s).trim();
  return EMAIL_RE.test(candidate) ? candidate : null;
}

/** Alamat From final: pakai yang valid; bila tidak, fallback ke username SMTP. */
function resolveFrom(s: EmailSettings): string {
  const name = (s.from?.match(/^([^<]+)</)?.[1] ?? '').trim();
  const direct = extractEmail(s.from);
  if (direct) return name ? `${name} <${direct}>` : direct;
  const userEmail = extractEmail(s.user);
  if (userEmail) return name ? `${name} <${userEmail}>` : userEmail;
  return s.from || s.user;
}

/** Terjemahkan galat pengiriman menjadi pesan yang benar-benar berguna bagi operator. */
export function describeError(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string; response?: string };
  const code = err?.code ?? (err?.responseCode ? String(err.responseCode) : '');
  const msg = String(err?.message ?? e ?? '');
  const resp = String(err?.response ?? '');
  const hay = `${msg} ${resp}`.toLowerCase();

  if (code === 'EPROVIDER') return 'Provider email tidak dikenal — pilih SMTP, Resend, Brevo, atau SendGrid.';
  if (code === 'EAUTH' || hay.includes('invalid login') || hay.includes('authentication')) {
    return 'Autentikasi email ditolak — periksa username & password/App Password (atau API key).';
  }
  if (code === 'ETIMEDOUT' || hay.includes('timeout') || hay.includes('timed out')) {
    return 'Koneksi ke server email TIMEOUT — umumnya port SMTP (465/587) diblokir hosting. Gunakan provider HTTP API (Resend/Brevo/SendGrid) yang lewat port 443, atau port SMTP lain yang diizinkan.';
  }
  if (code === 'ECONNREFUSED') return 'Server email menolak koneksi (host/port salah atau port diblokir).';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Host server email tidak ditemukan — periksa penulisan host.';
  if (code === 'ESOCKET' || code === 'ECONNRESET') return 'Koneksi email terputus (jaringan/firewall menutup koneksi).';
  if (/certificate|tls|ssl|wrong version/i.test(hay)) {
    return 'Masalah TLS/SSL — coba port 465 (SSL aktif) atau 587 (SSL nonaktif/STARTTLS).';
  }
  if (code === 'EENVELOPE' || hay.includes('sender') || hay.includes('from')) {
    return 'Alamat pengirim (From) ditolak server email — pastikan From memakai alamat email sah, mis. no-reply@domainanda.com.';
  }
  if (code.startsWith('HTTP_')) return `Penyedia email menolak permintaan (${code.replace('HTTP_', 'HTTP ')}): ${msg.slice(0, 160)}`;
  return `Gagal kirim email${code ? ` (${code})` : ''}: ${msg.slice(0, 180)}`;
}

async function sendViaSmtp(
  s: EmailSettings,
  to: string,
  subject: string,
  html: string,
  override?: { port: number; secure: boolean }
): Promise<void> {
  const port = override?.port ?? s.port;
  const secure = override?.secure ?? s.secure;
  const transporter = nodemailer.createTransport({
    host: s.host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    // Bila username kosong, kirim tanpa autentikasi (relay internal). Nodemailer hanya
    // mencoba AUTH kalau kredensial diberikan.
    ...(s.user ? { auth: { user: s.user, pass: s.pass } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  await transporter.sendMail({
    from: resolveFrom(s),
    to,
    subject,
    html,
    ...(s.replyTo ? { replyTo: s.replyTo } : {}),
  });
}

async function sendViaApi(s: EmailSettings, to: string, subject: string, html: string): Promise<void> {
  const from = resolveFrom(s);
  const fromEmail = extractEmail(from) ?? from;
  const fromName = (from.match(/^([^<]+)</)?.[1] ?? '').trim();
  const base = (p: string) => s.apiBaseUrl || p;
  let res: Response;
  const timeout = AbortSignal.timeout(20_000);

  if (s.provider === 'resend') {
    res = await fetch(base('https://api.resend.com/emails'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, ...(s.replyTo ? { reply_to: s.replyTo } : {}) }),
      signal: timeout,
    });
  } else if (s.provider === 'brevo') {
    res = await fetch(base('https://api.brevo.com/v3/smtp/email'), {
      method: 'POST',
      headers: { 'api-key': s.apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName || undefined },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        ...(s.replyTo ? { replyTo: { email: s.replyTo } } : {}),
      }),
      signal: timeout,
    });
  } else if (s.provider === 'sendgrid') {
    res = await fetch(base('https://api.sendgrid.com/v3/mail/send'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: fromName || undefined },
        ...(s.replyTo ? { reply_to: { email: s.replyTo } } : {}),
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
      signal: timeout,
    });
  } else {
    throw Object.assign(new Error('Provider email tidak dikenal'), { code: 'EPROVIDER' });
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw Object.assign(new Error(bodyText.slice(0, 200) || res.statusText), { code: `HTTP_${res.status}` });
  }
}

/** Kirim email — pilih SMTP atau HTTP API, dengan fallback port & pesan galat jelas. */
export async function sendMail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<MailResult> {
  const s = await getEmailSettings();
  if (!isEmailConfigured(s)) {
    return { ok: false, error: 'Pengaturan email belum lengkap (Pengaturan → Email & Notifikasi).' };
  }
  if (!extractEmail(to)) return { ok: false, error: `Alamat email tujuan tidak valid: ${to}` };

  const tried: string[] = [];
  let lastErr: unknown = null;
  let lastDetail = '';

  // ---- Mode HTTP API: satu percobaan, lewat port 443
  if (s.provider !== 'smtp') {
    tried.push(`${s.provider} API`);
    try {
      await sendViaApi(s, to, subject, html);
      return { ok: true, tried };
    } catch (e) {
      return { ok: false, error: describeError(e), detail: (e as Error).message, tried };
    }
  }

  // ---- Mode SMTP: coba kombinasi utama, lalu pasangan port lawan (SSL ⇄ STARTTLS)
  const attempts: Array<{ port: number; secure: boolean }> = [{ port: s.port, secure: s.secure }];
  if (s.port === 465) attempts.push({ port: 587, secure: false });
  else if (s.port === 587) attempts.push({ port: 465, secure: true });
  else attempts.push({ port: 587, secure: false }, { port: 465, secure: true });

  for (const a of attempts) {
    tried.push(`smtp ${a.port}/${a.secure ? 'SSL' : 'STARTTLS'}`);
    try {
      await sendViaSmtp(s, to, subject, html, a);
      return { ok: true, tried };
    } catch (e) {
      lastErr = e;
      const code = (e as { code?: string }).code;
      lastDetail = `${code ?? 'ERR'}: ${(e as Error).message}`;
      // Galat kredensial/alamat tidak akan membaik dengan ganti port → berhenti
      if (code === 'EAUTH' || code === 'EENVELOPE') break;
    }
  }
  return { ok: false, error: describeError(lastErr), detail: lastDetail, tried };
}

// ===================== TEMPLATE =====================

function shell(title: string, bodyHtml: string, siteName: string, tagline: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0a0c10;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c10;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:540px;background:#12161c;border:1px solid #262d37;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:22px 26px 6px;">
          <div style="font-size:17px;font-weight:800;color:#e8ebf0;">${siteName}</div>
          <div style="font-size:12px;color:#8b95a3;margin-top:2px;">${tagline}</div>
        </td></tr>
        <tr><td style="padding:10px 26px 6px;">
          <div style="font-size:15px;font-weight:700;color:#e8ebf0;">${title}</div>
        </td></tr>
        <tr><td style="padding:10px 26px 22px;color:#c9d0da;font-size:14px;line-height:1.65;">${bodyHtml}</td></tr>
        <tr><td style="padding:0 26px 22px;color:#8b95a3;font-size:11px;">
          Email ini dikirim otomatis oleh sistem. Mohon jangan membalas email ini.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function button(href: string, label: string, color = '#d61f2c'): string {
  return `<div style="text-align:center;margin:18px 0;">
    <a href="${href}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:8px;font-size:14px;">${label}</a>
  </div>`;
}

export type MailBranding = { siteName: string; tagline: string; companyName: string };

export async function getMailBranding(): Promise<MailBranding> {
  const org = await getOrgSettings();
  return { siteName: org.siteName, tagline: org.tagline, companyName: org.companyName };
}

export function resetPasswordEmailHtml(opts: {
  branding: MailBranding;
  url: string;
  name: string;
  minutes: number;
}): string {
  const body = `
    <p>Halo <b>${opts.name}</b>,</p>
    <p>Kami menerima permintaan untuk mereset kata sandi akun <b>${opts.branding.siteName}</b>.
       Klik tombol di bawah untuk membuat kata sandi baru.</p>
    ${button(opts.url, 'Buat Kata Sandi Baru')}
    <p style="font-size:12px;">Bila tombol tidak berfungsi, salin tautan berikut ke browser:<br/>
      <span style="color:#4d7cfe;word-break:break-all;">${opts.url}</span></p>
    <p>Tautan ini berlaku <b>${opts.minutes} menit</b> dan hanya dapat dipakai satu kali.</p>
    <p style="font-size:12px;color:#8b95a3;">Jika Anda tidak meminta reset kata sandi, abaikan email ini —
       kata sandi Anda tidak berubah.</p>`;
  return shell('Reset Kata Sandi', body, opts.branding.siteName, opts.branding.tagline);
}

export function passwordChangedEmailHtml(opts: { branding: MailBranding; name: string; time: string }): string {
  const body = `
    <p>Halo <b>${opts.name}</b>,</p>
    <p>Kata sandi akun <b>${opts.branding.siteName}</b> Anda baru saja <b>berhasil diubah</b> pada ${opts.time}.</p>
    <p style="font-size:13px;">Jika ini bukan Anda, segera hubungi admin redaksi dan lakukan reset kata sandi
       dari halaman masuk → “Lupa kata sandi?”.</p>`;
  return shell('Kata Sandi Diubah', body, opts.branding.siteName, opts.branding.tagline);
}

export function testEmailHtml(opts: { branding: MailBranding; provider: string; at: string }): string {
  const body = `
    <p>Ini email uji dari <b>${opts.branding.siteName}</b>.</p>
    <p>Bila Anda menerima email ini, pengaturan pengiriman email sudah benar dan fitur
       <b>reset kata sandi</b> dapat mengirim tautan ke pengguna.</p>
    <table cellpadding="0" cellspacing="0" style="margin-top:8px;font-size:13px;">
      <tr><td style="color:#8b95a3;padding-right:10px;">Metode</td><td>${opts.provider}</td></tr>
      <tr><td style="color:#8b95a3;padding-right:10px;">Waktu uji</td><td>${opts.at}</td></tr>
    </table>`;
  return shell('Uji Pengiriman Email', body, opts.branding.siteName, opts.branding.tagline);
}
