'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import SubmitButton from '@/components/ui/SubmitButton';
import PasswordStrengthMeter from './PasswordStrength';
import { changePasswordAction } from '@/actions/account';
import type { ActionState } from '@/lib/validations';
export default function ChangePasswordForm() {
  const router = useRouter();
  const [state, action] = useActionState<ActionState, FormData>(changePasswordAction, {});
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      router.push('/dashboard/akun?ok=1');
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label className="label" htmlFor="currentPassword">
          Sandi saat ini *
        </label>
        <input id="currentPassword" name="currentPassword" type="password" className="input" autoComplete="current-password" />
      </div>

      <div>
        <label className="label" htmlFor="newPassword">
          Sandi baru *
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
          Konfirmasi sandi baru *
        </label>
        <input id="confirmPassword" name="confirmPassword" type="password" className="input" autoComplete="new-password" />
      </div>

      {state?.error ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
          <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}

      <SubmitButton className="btn btn-primary" pendingText="Menyimpan sandi…">
        Ganti Sandi
      </SubmitButton>
    </form>
  );
}
