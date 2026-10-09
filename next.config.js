/** @type {import('next').NextConfig} */
// Aplikasi dipublish di slug platform => basePath '/newsroom-hub' dan publish
// HARUS memakai preserve_path_prefix: true (Next menangani prefix sendiri).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * Origin pengembangan (dipakai server action saat `npm run dev`) — SENGAJA hanya aktif
 * di mode non-produksi supaya tidak memperluas permukaan CSRF pada build produksi.
 */
const DEV_ORIGINS = process.env.NODE_ENV === 'production' ? [] : ['localhost:3000', 'localhost:3998'];

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // peta (tile OpenStreetMap) + media BunnyCDN
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "media-src 'self' blob: https:",
      "frame-src 'self' https://www.youtube.com https://youtube.com https://drive.google.com",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
];

const nextConfig = {
  basePath: BASE_PATH,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // Catatan: pdfkit & exceljs TIDAK lagi dipakai — ekspor PDF & Excel dihapus
  // (hanya CSV) untuk mengurangi beban VPS. Tidak perlu serverExternalPackages.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
      // Proteksi CSRF Server Actions: hanya origin MILIK APLIKASI INI yang diterima.
      //
      // PENTING (jangan diubah): JANGAN menambahkan domain aplikasi lain di sini
      // (mis. magang.garuda.tv). Newsroom Hub & GarudaTV Magang Center adalah dua
      // platform TERPISAH dengan infrastruktur sendiri — daftar origin yang saling
      // menyilang membuat aplikasi bergantung pada domain milik aplikasi lain dan
      // ikut memberi izin kepadanya tanpa alasan. Ubah daftar lewat env ALLOWED_ORIGINS.
      //
      // Origin pengembangan (localhost) hanya dipakai di mode non-produksi.
      allowedOrigins: (
        process.env.ALLOWED_ORIGINS ||
        ['rosid.vibecoder.co.id', 'newsroom.garuda.tv', ...DEV_ORIGINS].join(',')
      )
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
  },
};

module.exports = nextConfig;
