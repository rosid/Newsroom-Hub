import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getLoginSettings, getOrgSettings, getSecuritySettings, isTurnstileReady } from '@/lib/settings';
import TurnstileScript from '@/components/forms/TurnstileScript';
import { isPublicImageUrl, loginPageBackground, parseHeroPoints, parseHeroTitle, siteInitial } from '@/lib/login-content';
import LoginForm from '@/components/forms/LoginForm';
import Icon from '@/components/ui/Icon';

export const metadata = { title: 'Masuk' };

/**
 * Halaman login (frontpage).
 *
 * Seluruh teks dapat diubah dari Pengaturan → Halaman Login; gambar latar (hero) opsional.
 * Kolom teks yang dikosongkan TIDAK dikembalikan ke teks bawaan — bagian tersebut
 * disembunyikan, sehingga pengelola bisa memilih apa yang tampil.
 *
 * PENTING: gambar hero/logo harus berupa URL PUBLIK (http/https). `/api/media/...`
 * mewajibkan sesi login, sehingga nilai `local:`/`s3:` tidak akan tampil bagi pengunjung.
 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');
  const [org, login, security] = await Promise.all([getOrgSettings(), getLoginSettings(), getSecuritySettings()]);
  // Turnstile hanya dimuat bila dinyalakan DAN kuncinya lengkap (lihat isTurnstileReady).
  const turnstileSiteKey = isTurnstileReady(security) ? security.turnstileSiteKey.trim() : '';

  const points = parseHeroPoints(login.heroPoints);
  const titleParts = parseHeroTitle(login.heroTitle);
  const heroImage = isPublicImageUrl(login.heroImageUrl) ? login.heroImageUrl : '';
  const initial = siteInitial(org.siteName);
  const logo = isPublicImageUrl(org.logoUrl) ? org.logoUrl : '';
  const opacity = Math.max(0, Math.min(100, Number(login.heroImageOpacity) || 0)) / 100;
  // Latar khusus halaman login (kosong = ikut tema bawaan). Hanya warna tervalidasi
  // yang masuk ke CSS — lihat loginPageBackground().
  const pageBg = loginPageBackground(login.pageBgColor);

  /** Logo (bila diunggah & berupa URL publik) atau lambang huruf sebagai cadangan. */
  const brandMark = (extraClass: string) =>
    logo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={org.siteName}
        data-login-logo
        className={`${extraClass} w-auto rounded-lg object-contain`}
        style={{ height: org.logoWidth || 40 }}
      />
    ) : (
      <span
        className={`grid place-items-center rounded-lg font-black text-white ${extraClass}`}
        style={{ background: 'var(--brand)' }}
        data-login-initial
      >
        {initial}
      </span>
    );

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]" style={pageBg ? { background: pageBg } : undefined}>
      {/* Panel branding */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-bgdeep p-10 lg:flex">
        {heroImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover" data-login-hero />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                // Kepekatan 0 → gambar tampak penuh; 100 → paling gelap di bagian bawah
                // sehingga teks tetap terbaca. Naik monoton agar mudah diprediksi.
                background: `linear-gradient(to bottom, color-mix(in srgb, var(--bg-deep) ${Math.round(opacity * 70)}%, transparent), color-mix(in srgb, var(--bg-deep) ${Math.round(opacity * 100)}%, transparent))`,
              }}
              data-login-hero-overlay
            />
          </>
        ) : null}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(var(--line-soft) 1px, transparent 1px), linear-gradient(90deg, var(--line-soft) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
          }}
        />
        <div
          className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--brand) 28%, transparent)' }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            {brandMark('h-10 w-10 text-[15px]')}
            <div>
              <p className="text-[15px] font-extrabold tracking-tight">{org.siteName}</p>
              {org.companyName ? <p className="text-[11.5px] text-muted">{org.companyName}</p> : null}
            </div>
          </div>
        </div>

        <div className="relative max-w-lg">
          {login.heroBadge ? (
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-muted">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--brand)' }} />
              {login.heroBadge}
            </p>
          ) : null}
          {titleParts.length ? (
            <h1 className="text-[34px] font-extrabold leading-[1.15] tracking-tight" data-login-hero-title>
              {titleParts.map((p, i) => (
                <span
                  key={`${p.text}-${i}`}
                  style={
                    p.tone === 'brand'
                      ? { color: 'var(--brand)' }
                      : p.tone === 'accent'
                        ? { color: 'var(--accent)' }
                        : undefined
                  }
                >
                  {p.text}
                </span>
              ))}
            </h1>
          ) : null}
          {points.length ? (
            <ul className="mt-6 flex flex-col gap-3" data-login-hero-points>
              {points.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[13px] text-inksoft">
                  <Icon name="check" size={15} className="mt-[3px] shrink-0" style={{ color: 'var(--brand)' }} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="relative flex gap-6 text-[11.5px] text-muted">
          {login.heroFooterNote ? <span className="font-mono">{login.heroFooterNote}</span> : null}
          {login.heroFooterRights ? <span>{login.heroFooterRights}</span> : null}
        </div>
      </section>

      {/* Panel form */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            {brandMark('h-9 w-9 text-[14px]')}
            <p className="text-[14px] font-extrabold">{org.siteName}</p>
          </div>
          {login.formTitle ? (
            <h2 className="text-[22px] font-extrabold tracking-tight" data-login-form-title>
              {login.formTitle}
            </h2>
          ) : null}
          {login.formSubtitle ? (
            <p className="mb-6 mt-1 text-[13px] text-muted" data-login-form-subtitle>
              {login.formSubtitle}
            </p>
          ) : (
            <div className="mb-6" />
          )}
          <TurnstileScript enabled={Boolean(turnstileSiteKey)} />
          <LoginForm turnstileSiteKey={turnstileSiteKey} />
          {login.formCopyright ? (
            <p className="mt-6 text-center text-[11px] text-muted" data-login-copyright>
              {login.formCopyright}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
