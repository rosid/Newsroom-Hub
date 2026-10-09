import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getOrgSettings } from '@/lib/settings';
import LoginForm from '@/components/forms/LoginForm';
import Icon from '@/components/ui/Icon';

export const metadata = { title: 'Masuk' };

const POINTS = [
  'Kirim naskah + footage dari lapangan, langsung dari ponsel reporter',
  'Pemisahan tegas Tabung Pusat & Biro Daerah, dorong berita daerah ke siaran nasional',
  'Peta sebaran berita, statistik harian, dan laporan per biro',
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');
  const org = await getOrgSettings();

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Panel branding */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-bgdeep p-10 lg:flex">
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
            <span
              className="grid h-10 w-10 place-items-center rounded-lg text-[15px] font-black text-white"
              style={{ background: 'var(--brand)' }}
            >
              G
            </span>
            <div>
              <p className="text-[15px] font-extrabold tracking-tight">{org.siteName}</p>
              <p className="text-[11.5px] text-muted">{org.companyName}</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-lg">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-muted">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--brand)' }} />
            Newsroom Control Desk
          </p>
          <h1 className="text-[34px] font-extrabold leading-[1.15] tracking-tight">
            Satu pintu pengiriman berita <span style={{ color: 'var(--brand)' }}>Pusat</span> &amp;{' '}
            <span style={{ color: 'var(--accent)' }}>Biro Daerah</span>.
          </h1>
          <ul className="mt-6 flex flex-col gap-3">
            {POINTS.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[13px] text-inksoft">
                <Icon name="check" size={15} className="mt-[3px] shrink-0" style={{ color: 'var(--brand)' }} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex gap-6 text-[11.5px] text-muted">
          <span className="font-mono">v1.0 · newsroom.garuda.tv</span>
          <span>Hak akses berjenjang 9 level pengguna</span>
        </div>
      </section>

      {/* Panel form */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span
              className="grid h-9 w-9 place-items-center rounded-lg text-[14px] font-black text-white"
              style={{ background: 'var(--brand)' }}
            >
              G
            </span>
            <p className="text-[14px] font-extrabold">{org.siteName}</p>
          </div>
          <h2 className="text-[22px] font-extrabold tracking-tight">Masuk ke ruang redaksi</h2>
          <p className="mb-6 mt-1 text-[13px] text-muted">
            Gunakan email redaksi yang terdaftar. Hubungi admin bila akses terkendala.
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
