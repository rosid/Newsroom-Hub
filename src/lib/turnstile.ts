/**
 * Verifikasi TURNSTILE Cloudflare (SERVER ONLY).
 *
 * Dipisahkan dari `settings.ts` agar logika verifikasi punya satu tempat dan mudah diuji
 * (fungsi `verifyTurnstileResponse()` menerima `fetch` yang bisa diganti saat pengujian).
 *
 * Alur: widget di halaman login menghasilkan token -> token dikirim bersama form ->
 * server memverifikasi ke endpoint siteverify memakai SECRET KEY -> hanya lanjut bila sukses.
 *
 * PENTING (jangan diubah tanpa alasan): token Turnstile bersifat SEKALI PAKAI dan berumur
 * pendek. Karena itu verifikasi WAJIB dilakukan sebelum memeriksa kredensial, dan token
 * yang gagal TIDAK boleh membuat akun terkunci — kegagalan verifikasi dihitung sebagai
 * percobaan login biasa oleh throttle (lihat actions/auth.ts).
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult = { ok: boolean; error?: string; codes?: string[] };

type SiteverifyBody = {
  success?: boolean;
  'error-codes'?: string[];
};

/**
 * Terjemahkan kode galat Turnstile menjadi pesan yang bisa ditindaklanjuti pengguna/admin.
 * Kode lengkap: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/
 */
export function describeTurnstileError(codes: string[] | undefined): string {
  const list = codes ?? [];
  if (list.includes('missing-input-secret') || list.includes('invalid-input-secret')) {
    return 'Secret Key Turnstile tidak valid. Periksa Pengaturan → Keamanan.';
  }
  if (list.includes('missing-input-response')) {
    return 'Verifikasi keamanan belum selesai. Centang ulang lalu coba lagi.';
  }
  if (list.includes('timeout-or-duplicate')) {
    return 'Verifikasi keamanan sudah kedaluwarsa atau terpakai. Muat ulang halaman lalu coba lagi.';
  }
  if (list.includes('invalid-input-response')) {
    return 'Verifikasi keamanan tidak sah. Muat ulang halaman lalu coba lagi.';
  }
  if (list.includes('bad-request')) return 'Permintaan verifikasi keamanan tidak valid.';
  return 'Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.';
}

/**
 * Verifikasi token Turnstile. TIDAK PERNAH melempar — kegagalan jaringan diperlakukan sebagai
 * kegagalan verifikasi dengan pesan yang jelas (fail-closed), supaya halaman login tidak error 500.
 */
export async function verifyTurnstileResponse(input: {
  secret: string;
  token: string;
  remoteIp?: string;
  /** Untuk pengujian — bisa diganti dengan tiruan. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<TurnstileResult> {
  const secret = String(input.secret ?? '').trim();
  const token = String(input.token ?? '').trim();
  if (!secret) return { ok: false, error: 'Secret Key Turnstile belum diisi di Pengaturan → Keamanan.' };
  if (!token) return { ok: false, error: 'Verifikasi keamanan belum selesai. Centang ulang lalu coba lagi.' };

  const doFetch = input.fetchImpl ?? fetch;
  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (input.remoteIp) body.set('remoteip', input.remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);
  try {
    const res = await doFetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `Verifikasi keamanan tidak dapat dihubungi (HTTP ${res.status}).` };
    }
    const data = (await res.json().catch(() => ({}))) as SiteverifyBody;
    if (data.success) return { ok: true };
    return { ok: false, error: describeTurnstileError(data['error-codes']), codes: data['error-codes'] };
  } catch (e) {
    const msg = (e as Error)?.name === 'AbortError'
      ? 'Verifikasi keamanan melebihi batas waktu.'
      : 'Verifikasi keamanan tidak dapat dihubungi.';
    return { ok: false, error: `${msg} Coba lagi.` };
  } finally {
    clearTimeout(timer);
  }
}
