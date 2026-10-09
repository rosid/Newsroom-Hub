'use client';

import { useActionState } from 'react';
import { testStorageAction } from '@/actions/settings';
import SubmitButton from '@/components/ui/SubmitButton';
import type { ActionState } from '@/lib/validations';

export default function TestStorageButton() {
  const [state, action] = useActionState<ActionState, FormData>(testStorageAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <SubmitButton className="btn btn-primary" pendingText="Menguji storage…">
        Uji Koneksi Storage
      </SubmitButton>
      {state?.message ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
          {state.message}
        </p>
      ) : null}
      {state?.error ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
