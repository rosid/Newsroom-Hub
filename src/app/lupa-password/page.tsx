import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getOrgSettings, getEmailSettings, isEmailConfigured } from '@/lib/settings';
import ForgotPasswordForm from '@/components/forms/ForgotPasswordForm';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lupa Kata Sandi' };

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  const [org, email] = await Promise.all([getOrgSettings(), getEmailSettings()]);
  const configured = isEmailConfigured(email);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-9 w-9 place-items-center rounded-lg text-[14px] font-black text-white"
          style={{ background: 'var(--brand)' }}
        >
          G
        </span>
        <div>
          <p className="text-[14px] font-extrabold leading-tight">{org.siteName}</p>
          <p className="text-[11px] text-muted">{org.companyName}</p>
        </div>
      </div>

      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight">Lupa kata sandi</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Masukkan email akun Anda. Tautan pembuatan kata sandi baru akan dikirim ke email tersebut dan berlaku 60 menit.
        </p>
      </div>

      {!configured ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--warn)_40%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--warn)]">
          <Icon name="alert" size={14} className="mt-[1px] shrink-0" />
          <span>
            Pengiriman email belum dikonfigurasi admin (Pengaturan → Email &amp; Notifikasi). Anda tetap bisa
            meminta tautan reset; tautannya akan ditampilkan langsung di layar agar akun tidak terkunci.
          </span>
        </p>
      ) : null}

      <ForgotPasswordForm />

      <p className="text-center text-[11.5px] text-muted">
        <Link href="/login" className="hover:text-accent">
          Kembali ke halaman masuk
        </Link>
      </p>
    </main>
  );
}
