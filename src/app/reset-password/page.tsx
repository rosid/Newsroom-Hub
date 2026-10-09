import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { getOrgSettings } from '@/lib/settings';
import { RESET_TOKEN_TTL_MINUTES, findResetToken, normalizeToken } from '@/lib/password-reset';
import ResetPasswordForm from '@/components/forms/ResetPasswordForm';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reset Kata Sandi', robots: { index: false, follow: false } };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = normalizeToken(raw);
  const org = await getOrgSettings();

  const lookup = token ? await findResetToken(token) : { ok: false as const, reason: 'invalid' as const };
  const account = lookup.ok
    ? await prisma.user.findUnique({ where: { id: lookup.userId }, select: { email: true } })
    : null;

  const reasonText =
    lookup.ok || !token
      ? 'Tautan reset tidak lengkap. Buka tautan langsung dari email, atau minta tautan baru.'
      : lookup.reason === 'expired'
        ? `Tautan reset sudah kedaluwarsa (berlaku ${RESET_TOKEN_TTL_MINUTES} menit). Silakan minta tautan baru.`
        : lookup.reason === 'used'
          ? 'Tautan reset ini sudah pernah dipakai. Silakan minta tautan baru.'
          : 'Tautan reset tidak dikenali. Pastikan seluruh tautan dari email tersalin dengan benar.';

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
          <p className="text-[11px] text-muted">Reset kata sandi</p>
        </div>
      </div>

      {lookup.ok ? (
        <>
          <div>
            <h1 className="text-[21px] font-extrabold tracking-tight">Buat kata sandi baru</h1>
            <p className="mt-1 text-[12.5px] text-muted">
              Kata sandi minimal 8 karakter dan harus memuat huruf besar, huruf kecil, serta angka.
            </p>
          </div>
          <ResetPasswordForm token={token} email={account?.email ?? null} />
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-4">
          <span className="flex items-start gap-2 text-[12.5px] text-danger" data-reset-error={lookup.reason}>
            <Icon name="alert" size={15} className="mt-[1px] shrink-0" />
            <span>{reasonText}</span>
          </span>
          <Link href="/lupa-password" className="btn btn-primary self-start">
            <Icon name="refresh" size={13} /> Minta Tautan Baru
          </Link>
        </div>
      )}

      <p className="text-center text-[11.5px] text-muted">
        <Link href="/login" className="hover:text-accent">
          Kembali ke halaman masuk
        </Link>
      </p>
    </main>
  );
}
