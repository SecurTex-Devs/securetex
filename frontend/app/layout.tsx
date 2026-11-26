import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Providers } from '@/shared/providers';
import '@/styles/fonts.css';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'SecurTex · Editor LaTeX colaborativo seguro', template: '%s · SecurTex' },
  description: 'Escribe en equipo, organiza tus documentos LaTeX y compila tu PDF desde un mismo editor.',
  icons: { icon: '/icon.svg' },
  referrer: 'strict-origin-when-cross-origin',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f2ec' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e0c' },
  ],
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/22a5144ee8d83bca-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/84adbee2f2a7cb50-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/8edf6d3506a17285-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/bb3ef058b751a6ad-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- debe ejecutarse antes de pintar */}
        {/* El navegador oculta el nonce del DOM a propósito: la diferencia al hidratar es esperada. */}
        <script nonce={nonce} src="/theme-init.js" suppressHydrationWarning />
      </head>
      <body>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
