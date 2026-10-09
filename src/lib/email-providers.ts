/**
 * Metadata provider email — CLIENT-SAFE (dipakai form pengaturan).
 * Jangan impor prisma/next/fs di sini. Nilai runtime disimpan di lib/settings.ts
 * (server) yang meng-import ulang dari file ini agar tidak ada duplikasi.
 */
export type EmailProvider = 'smtp' | 'resend' | 'brevo' | 'sendgrid';

export const EMAIL_PROVIDERS: EmailProvider[] = ['smtp', 'resend', 'brevo', 'sendgrid'];

export const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  smtp: 'SMTP (mail server perusahaan)',
  resend: 'Resend (HTTP API, port 443)',
  brevo: 'Brevo (HTTP API, port 443)',
  sendgrid: 'SendGrid (HTTP API, port 443)',
};

/** Keterangan singkat tiap provider untuk ditampilkan di form. */
export const EMAIL_PROVIDER_NOTES: Record<EmailProvider, string[]> = {
  smtp: [
    'Dipakai bila Anda punya mail server sendiri (mis. mail.garuda.tv) atau akun SMTP penyedia.',
    'PENTING: pada server ini port SMTP 465 & 587 terbukti DIBLOKIR (koneksi timeout). Bila uji kirim gagal dengan pesan TIMEOUT, pindah ke provider HTTP API.',
    'Password sebaiknya App Password (bukan password login utama).',
  ],
  resend: ['Buat API key di resend.com, verifikasi domain pengirim, lalu tempel API key di kolom yang tersedia.'],
  brevo: ['Ambil API key dari dashboard Brevo (SMTP & API → API Keys), lalu verifikasi alamat pengirim.'],
  sendgrid: ['Buat API key dengan izin Mail Send, lalu verifikasi Single Sender / domain pengirim.'],
};
