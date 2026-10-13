'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/actions/auth';
import type { ActionState } from '@/lib/validations';
import SubmitButton from '@/components/ui/SubmitButton';
import Icon from '@/components/ui/Icon';

/**
 * Form masuk.
 *
 * KEAMANAN — JANGAN menampilkan kembali kredensial apa pun di halaman ini.
 * Sebelumnya form ini memuat daftar akun demo + sandi bersama (`Demo123!`) dan
 * bahkan mengisikannya otomatis, sehingga siapa pun yang membuka URL produksi
 * langsung dapat masuk sebagai Super Admin/Admin. Daftar akun demo sekarang
 * hanya ada di `README.md` (tidak disajikan ke publik — `/README.md` → 404).
 */
export default function LoginForm({ turnstileSiteKey = '' }: { turnstileSiteKey?: string } = {}) {
  const router = useRouter();
  /**
   * Turnstile Cloudflare — hanya dirender bila Site Key diberikan (server memutuskan
   * berdasarkan Pengaturan → Keamanan). Token yang dihasilkan widget masuk ke form sebagai
   * `cf-turnstile-response` dan diverifikasi server SEBELUM kredensial diperiksa.
   */
  const turnstileOn = Boolean(turnstileSiteKey);
  const [state, action] = useActionState<ActionState, FormData>(loginAction, {});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    setResetDone(new URLSearchParams(window.location.search).get('reset') === '1');
  }, []);

  useEffect(() => {
    if (state?.ok) {
      router.replace('/dashboard');
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="email">
          Email Redaksi
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          className="input"
          placeholder="nama@garuda.tv"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {resetDone ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12.5px] text-[color:var(--ok)]" data-reset-success>
          Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru Anda.
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor="password">
          Sandi
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="input !pr-11"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {/*
            Tombol lihat/sembunyikan sandi.
            - `type="button"` WAJIB: tanpa itu tombol ikut mengirim form (login) saat diklik.
            - `onMouseDown` dicegah agar fokus tidak berpindah dari kolom sandi (kursor tetap di posisi terakhir).
            - `aria-label` + `title` supaya ikon tetap punya nama untuk pembaca layar
              (atribut `aria-hidden` pada komponen Icon membuat ikonnya sendiri tak bersuara).
          */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
            aria-pressed={showPassword}
            title={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
            data-toggle-password
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted transition-colors hover:bg-panel2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
          </button>
        </div>
      </div>

      {state?.error ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12.5px] text-danger">
          <Icon name="alert" size={15} className="mt-[1px] shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}

      {turnstileOn ? (
        <div className="flex flex-col gap-1.5" data-turnstile>
          {/* Widget Turnstile menyuntikkan dirinya ke elemen ini. */}
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="auto" />
          <p className="text-[11px] text-muted">
            Dilindungi Cloudflare Turnstile. Verifikasi dilakukan sebelum kredensial diperiksa.
          </p>
        </div>
      ) : null}

      <SubmitButton className="btn btn-primary w-full" pendingText="Memverifikasi…">
        Masuk Newsroom
      </SubmitButton>

      <p className="text-center text-[12px] text-muted">
        <Link href="/lupa-password" className="font-semibold text-accent hover:underline" data-forgot-link>
          Lupa kata sandi?
        </Link>
      </p>
    </form>
  );
}
