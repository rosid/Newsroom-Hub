import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { getOrgSettings, getSeoSettings } from '@/lib/settings';
import { p } from '@/lib/base';

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings();
  return {
    title: { default: seo.title, template: `%s · ${seo.title}` },
    description: seo.description,
    icons: { icon: [{ url: p('/icon.svg'), type: 'image/svg+xml' }] },
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [org, store] = await Promise.all([getOrgSettings(), cookies()]);
  const pref = store.get('newsroom_theme')?.value;
  const theme = pref === 'light' || pref === 'dark' ? pref : org.defaultTheme || 'dark';

  return (
    <html lang="id" className={theme === 'dark' ? 'dark' : ''} suppressHydrationWarning>
      <head>
        <style
          // Warna tema dari Pengaturan Master (di-override runtime oleh admin)
          dangerouslySetInnerHTML={{
            __html: `:root{--brand:${org.primaryColor};--accent:${org.accentColor};--brand-deep:color-mix(in srgb, ${org.primaryColor} 78%, #000);}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
