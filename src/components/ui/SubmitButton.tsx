'use client';

import { useFormStatus } from 'react-dom';

export default function SubmitButton({
  children,
  pendingText,
  className = 'btn btn-primary',
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? (pendingText ?? 'Memproses…') : children}
    </button>
  );
}
