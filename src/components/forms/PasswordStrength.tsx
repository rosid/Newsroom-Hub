'use client';

import Icon from '@/components/ui/Icon';
import { PASSWORD_RULES, STRENGTH_LABELS, passwordPassed, strengthColor } from '@/lib/password-rules';

export { PASSWORD_RULES, STRENGTH_LABELS };

/**
 * Indikator kekuatan kata sandi + checklist aturan.
 * Aturan berasal dari `src/lib/password-rules.ts` yang juga dipakai validator server,
 * sehingga checklist di UI tidak pernah berbeda dengan yang ditegakkan di server.
 */
export default function PasswordStrengthMeter({ value, showChecklist = true }: { value: string; showChecklist?: boolean }) {
  const passed = passwordPassed(value);
  const label = value ? STRENGTH_LABELS[passed] : '';
  const color = strengthColor(passed);

  return (
    <div className="flex flex-col gap-2" data-password-strength={passed}>
      <div className="flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel3">
          <span
            className="block h-full rounded-full transition-all"
            style={{ width: `${(passed / PASSWORD_RULES.length) * 100}%`, background: color }}
          />
        </span>
        <span className="w-24 text-right text-[11px] font-semibold" style={{ color }} data-strength-label>
          {label}
        </span>
      </div>

      {showChecklist ? (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(value);
            return (
              <li
                key={r.key}
                className="flex items-center gap-1.5 text-[11.5px]"
                style={{ color: ok ? 'var(--ok)' : 'var(--muted)' }}
                data-rule={r.key}
                data-rule-ok={ok ? '1' : '0'}
              >
                <Icon name={ok ? 'check' : 'x'} size={12} />
                {r.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
