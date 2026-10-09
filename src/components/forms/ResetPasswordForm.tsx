'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import SubmitButton from '@/components/ui/SubmitButton';
import PasswordStrengthMeter from './PasswordStrength';
import { resetPasswordAction, type ResetState } from '@/actions/password-reset';

/** Form pembuatan kata sandi baru (halaman publik, memakai token dari email). */
export default function ResetPasswordForm({ token, email }: { token: string; email: string | null }) {
  const router = useRouter();
  const [state, action] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (state?.ok && state.done) {
      const t = setTimeout(() => {
        router.push('/login?reset=1');
        router.refresh();
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  if (state?.ok && state.done) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] p-4 text-center">
        <Icon name="check" size={22} className="mx-auto text-[color:var(--ok)]" />
        <p className="text-[13px] font-semibold" data-reset-done>
          {state.message}
        </p>
        <p className="text-[12px] text-muted">Mengalihkan ke halaman masuk…</p>
        <Link href="/login?reset=1" className="btn btn-primary">
          <Icon name="login" size={13} /> Masuk Sekarang
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {email ? (
        <p className="rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-muted">
          Akun: <span className="font-semibold text-ink">{email}</span>
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor="newPassword">
          Kata sandi baru
        </label>
        <div className="relative">
          <input
            id="newPassword"
            name="newPassword"
            type={show ? 'text' : 'password'}
            className="input !pr-16"
            autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11.5px] font-semibold text-muted hover:text-ink"
          >
            {show ? 'Sembunyikan' : 'Lihat'}
          </button>
        </div>
        <div className="mt-2">
          <PasswordStrengthMeter value={value} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="confirmPassword">
          Ulangi kata sandi baru
        </label>
        <input id="confirmPassword" name="confirmPassword" type="password" className="input" autoComplete="new-password" required />
      </div>

      {state?.error ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12.5px] text-danger">
          <Icon name="alert" size={15} className="mt-[1px] shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}

      <SubmitButton className="btn btn-primary w-full" pendingText="Menyimpan kata sandi…">
        Simpan Kata Sandi Baru
      </SubmitButton>

      <p className="text-center text-[12px] text-muted">
        Tautan bermasalah?{' '}
        <Link href="/lupa-password" className="font-semibold text-accent hover:underline">
          Minta tautan baru
        </Link>
      </p>
    </form>
  );
}
