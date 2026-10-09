'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import SubmitButton from '@/components/ui/SubmitButton';
import { forgotPasswordAction, type ResetState } from '@/actions/password-reset';

/**
 * Form permintaan tautan reset kata sandi (halaman PUBLIK).
 *
 * KEAMANAN (audit Okt 2026 A-1): tautan reset TIDAK pernah ditampilkan di sini.
 * Halaman ini dapat dibuka siapa pun tanpa login, jadi menampilkan tautan reset
 * (mis. ketika email belum dikonfigurasi) sama dengan menyerahkan akun kepada
 * orang yang menebak email terdaftar. Bila email gagal terkirim, pengguna
 * diarahkan menghubungi admin redaksi.
 */
export default function ForgotPasswordForm() {
  const [state, action] = useActionState<ResetState, FormData>(forgotPasswordAction, {});
  const mailFailed = Boolean(state?.mailFailed);

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
            <span data-reset-fallback={mailFailed ? '1' : '0'}>{state.message}</span>
          </span>
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
