'use client';

import Script from 'next/script';

/**
 * Memuat skrip Turnstile Cloudflare hanya saat fitur dinyalakan.
 *
 * Dipisah sebagai komponen client supaya `next/script` (yang perlu strategi pemuatan di browser)
 * tidak dipanggil dari server component. `afterInteractive` dipakai karena halaman login adalah
 * halaman pertama yang dibuka pengguna — memuatnya lebih awal hanya menambah beban.
 *
 * CATATAN CSP (penting): skrip & iframe Turnstile berasal dari `challenges.cloudflare.com`.
 * Kebijakan CSP aplikasi ada di `next.config.js` dan WAJIB memuat domain itu pada `script-src`,
 * `frame-src`, dan `connect-src` — kalau tidak, widget tidak akan muncul dan login akan gagal
 * (server memverifikasi token yang tidak pernah ada).
 */
export default function TurnstileScript({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <Script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js"
      strategy="afterInteractive"
      async
      defer
    />
  );
}
