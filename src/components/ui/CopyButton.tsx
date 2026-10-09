'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';

/**
 * Menyalin teks ke clipboard dengan fallback untuk konteks non-secure (http)
 * atau browser lama yang tidak mengizinkan navigator.clipboard.
 */
export default function CopyButton({
  value,
  label = 'Salin',
  copiedLabel = 'Tersalin',
  className = 'btn btn-sm',
  title,
  onCopied,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  title?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyText(value);
    setCopied(ok);
    if (ok) onCopied?.();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button type="button" onClick={() => void copy()} className={className} title={title ?? `Salin: ${value}`}>
      <Icon name={copied ? 'check' : 'file'} size={13} />
      {copied ? copiedLabel : label}
    </button>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* lanjut ke fallback */
  }
  // Fallback: textarea sementara + execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
