import { requireRole } from '@/lib/session';
import { getEmailSettings, getStoredEmailSettings, isEmailConfigured, describeEmail } from '@/lib/settings';
import SettingsNav from '@/components/layout/SettingsNav';
import EmailSettingsForm, { type EmailFormValues } from '@/components/forms/EmailSettingsForm';
import Icon from '@/components/ui/Icon';
import { RESET_TOKEN_TTL_MINUTES, RESET_MAX_PER_HOUR } from '@/lib/password-reset';
import { formatDateTimeID } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email & Notifikasi' };

export default async function EmailSettingsPage() {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const [settings, stored] = await Promise.all([getEmailSettings(), getStoredEmailSettings()]);
  const configured = isEmailConfigured(settings);
  const status = describeEmail(settings, configured);

  const initial: EmailFormValues = {
    provider: settings.provider,
    host: settings.host,
    port: settings.port,
    user: settings.user,
    from: settings.from,
    replyTo: settings.replyTo,
    secure: settings.secure,
    hasPass: Boolean(settings.pass),
    hasApiKey: Boolean(settings.apiKey),
    apiBaseUrl: settings.apiBaseUrl,
  };

  const updatedAt = (stored as unknown as { updatedAt?: string }).updatedAt;
  const updatedBy = (stored as unknown as { updatedBy?: string }).updatedBy;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">Email &amp; Notifikasi</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Pengaturan pengiriman email dipakai untuk <strong>lupa kata sandi</strong>, notifikasi internal, dan
          email uji. Gunakan SMTP mail server Anda atau provider HTTP API (Resend/Brevo/SendGrid).
        </p>
      </header>

      <SettingsNav user={user} active="email" />

      {/* Status */}
      <section className="panel shadow-soft p-4" data-email-status data-email-configured={configured ? '1' : '0'} data-email-provider={settings.provider}>
        <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
          <Icon name="send" size={15} className="text-muted" /> Status Pengiriman Email
        </h2>
        <dl className="grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Metode</dt>
            <dd className="font-semibold">{status.providerLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Kesiapan</dt>
            <dd>
              <span className={configured ? 'badge badge-ok' : 'badge badge-danger'}>
                {configured ? 'Siap mengirim email' : 'Belum lengkap'}
              </span>
            </dd>
          </div>
          {settings.provider === 'smtp' ? (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Host &amp; port</dt>
                <dd className="mono">
                  {settings.host || '—'}:{settings.port} {settings.secure ? '(SSL)' : '(STARTTLS)'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Username</dt>
                <dd className="mono">{settings.user || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Password</dt>
                <dd>{settings.pass ? <span className="badge badge-ok">tersimpan (terenkripsi)</span> : <span className="badge badge-danger">belum ada</span>}</dd>
              </div>
            </>
          ) : (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">API key</dt>
              <dd>{settings.apiKey ? <span className="badge badge-ok">tersimpan (terenkripsi)</span> : <span className="badge badge-danger">belum ada</span>}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Alamat pengirim</dt>
            <dd className="mono text-right">{settings.from || '(memakai username SMTP)'}</dd>
          </div>
          {updatedAt ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Terakhir diubah</dt>
              <dd>
                {formatDateTimeID(updatedAt)}
                {updatedBy ? ` · ${updatedBy}` : ''}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-3 rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-muted">{status.note}</p>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <EmailSettingsForm initial={initial} />

        <div className="flex flex-col gap-4">
          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="lock" size={15} className="text-muted" /> Alur Lupa Kata Sandi
            </h2>
            <ol className="flex flex-col gap-2 text-[12px] text-muted">
              <li>1. Pengguna membuka <span className="mono">/lupa-password</span> dan memasukkan email terdaftar.</li>
              <li>2. Sistem membuat token sekali pakai (berlaku {RESET_TOKEN_TTL_MINUTES} menit) lalu mengirim tautannya lewat email.</li>
              <li>3. Pengguna membuka <span className="mono">/reset-password?token=…</span> dan membuat kata sandi baru.</li>
              <li>4. Kata sandi diperbarui, pengguna diberi tahu lewat email + notifikasi, lalu masuk dengan sandi baru.</li>
            </ol>
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[11.5px] text-muted">
              <li>• Token hanya disimpan sebagai hash SHA-256 — token asli tidak pernah ada di database.</li>
              <li>• Satu tautan aktif per pengguna; tautan lama otomatis batal saat minta tautan baru.</li>
              <li>• Permintaan dibatasi {RESET_MAX_PER_HOUR}× per jam per email + IP.</li>
              <li>• Respons selalu sama (tidak membocorkan email mana yang terdaftar).</li>
              <li>• Bila email gagal terkirim, tautan ditampilkan langsung di layar + admin diberi notifikasi, sehingga akun tidak terkunci.</li>
            </ul>
          </section>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="alert" size={15} className="text-muted" /> Catatan Penting Provider
            </h2>
            <ul className="flex flex-col gap-1.5 text-[12px] text-muted">
              <li>
                • <strong>Port SMTP 465 &amp; 587 diblokir</strong> pada server ini (terbukti dari aplikasi lain di
                server yang sama: koneksi timeout, sementara HTTPS/443 berhasil). Bila uji kirim gagal dengan pesan
                TIMEOUT, pindah ke provider HTTP API.
              </li>
              <li>• Pastikan alamat pengirim sudah diverifikasi di penyedia (Resend/Brevo/SendGrid) agar email tidak ditolak.</li>
              <li>• Minta penerima memeriksa folder spam pada pengiriman pertama.</li>
              <li>• Kredensial disimpan terenkripsi (AES-256-GCM) dan tidak pernah dikirim ke browser.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
