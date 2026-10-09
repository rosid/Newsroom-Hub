'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SubmitButton from '@/components/ui/SubmitButton';
import Icon from '@/components/ui/Icon';
import type { ActionState } from '@/lib/validations';

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form generik dengan tampilan error/sukses dari server action
 * (pola useActionState). Field dikirim sebagai children dari server component.
 */
export default function ActionForm({
  action,
  children,
  submitLabel,
  pendingText,
  className = 'flex flex-col gap-3',
  buttonClassName = 'btn btn-primary',
  successMessage,
  footer,
  hideSubmit = false,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel: string;
  pendingText?: string;
  className?: string;
  buttonClassName?: string;
  successMessage?: string;
  footer?: React.ReactNode;
  hideSubmit?: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className={className}>
      {children}

      {state?.error ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
          <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
          {state.message || successMessage || 'Berhasil disimpan.'}
        </p>
      ) : null}

      {hideSubmit ? null : (
        <div className="flex items-center gap-2">
          <SubmitButton className={buttonClassName} pendingText={pendingText ?? 'Menyimpan…'}>
            {submitLabel}
          </SubmitButton>
          {footer}
        </div>
      )}
      {hideSubmit ? footer : null}
    </form>
  );
}
