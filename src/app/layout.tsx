import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import Script from 'next/script';
import { getBranding } from '@/lib/branding-server';
import { BrandingProvider } from '@/components/BrandingProvider';
import './globals.css';

export const dynamic = 'force-dynamic';
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBranding();
  let metadataBase: URL | undefined;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL || '');
    if (url.protocol === 'https:' && !url.username && !url.password) metadataBase = url;
  } catch { /* До настройки домена используем относительные ссылки. */ }
  return {
    metadataBase,
    title: brand.name + ' — ' + brand.tagline,
    description: brand.description,
    icons: { icon: brand.logoUrl || '/brand-mark.svg' },
    openGraph: { title: brand.name, description: brand.description, siteName: brand.name, locale: 'ru_RU', type: 'website' },
    twitter: { card: 'summary', title: brand.name, description: brand.description },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBranding();
  const rgb = [1, 3, 5].map(offset => Number.parseInt(brand.accent.slice(offset, offset + 2), 16)).join(' ');
  return <html lang="ru" style={{ '--accent': brand.accent, '--accent-rgb': rgb } as CSSProperties}>
    <head>
      <meta name="color-scheme" content="only light" />
      <Script src="https://st.max.ru/js/max-web-app.js" strategy="beforeInteractive" />
    </head>
    <body className="bg-[#efefef] text-black antialiased"><BrandingProvider value={brand}>{children}</BrandingProvider></body>
  </html>;
}
