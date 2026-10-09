'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import SubmitButton from '@/components/ui/SubmitButton';
import CopyButton from '@/components/ui/CopyButton';
import { forgotPasswordAction, type ResetState } from '@/actions/password-reset';
import { BASE_PATH } from '@/lib/base';

/** Form permintaan tautan reset kata sandi (halaman publik). */
export default function ForgotPasswordForm() {
  const [state, action] = useActionState<ResetState, FormData>(forgotPasswordAction, {});
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const manualPath = state?.fieldErrors?.manualUrl ?? '';
  const manualUrl = manualPath ? `${origin}${BASE_PATH}${manualPath}` : '';

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="email">
          Email akun newsroom
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="input"
          placeholder="nama@garuda.tv"
        />
        <p className="hint mt-1">Masukkan email yang terdaftar. Kami akan mengirim tautan pembuatan kata sandi baru.</p>
      </div>

      {state?.error ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12.5px] text-danger">
          <Icon name="alert" size={15} className="mt-[1px] shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}

      {state?.ok ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[color-mix(in_srgb,var(--warn)_40%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2 text-[12.5px] text-[color:var(--warn)]">
          <span className="flex items-start gap-2">
            <Icon name="alert" size={15} className="mt-[1px] shrink-0" />
            <span data-reset-fallback={manualUrl ? '1' : '0'}>{state.message}</span>
          </span>

          {manualUrl ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-line bg-panel p-2">
              <input readOnly value={manualUrl} className="input mono !text-[11px]" onFocus={(e) => e.currentTarget.select()} data-manual-reset-url />
              <div className="flex flex-wrap gap-1.5">
                <CopyButton value={manualUrl} label="Salin tautan reset" className="btn btn-sm btn-primary" />
                <a href={manualUrl} className="btn btn-sm">
                  <Icon name="external" size={13} /> Buka halaman reset
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <SubmitButton className="btn btn-primary w-full" pendingText="Memproses…">
        Kirim Tautan Reset
      </SubmitButton>

      <p className="text-center text-[12px] text-muted">
        Ingat kata sandi Anda?{' '}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Kembali ke halaman masuk
        </Link>
      </p>
    </form>
  );
}
