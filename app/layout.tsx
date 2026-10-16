import type { Metadata, Viewport } from 'next';
import { Geist, JetBrains_Mono, Newsreader } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Providers } from '@/shared/providers';
import '@/styles/globals.css';

// Fuentes autoalojadas: next/font las descarga en la compilación y las sirve
// desde el propio origen. Ninguna petición a dominios externos (AGENTS.md §1.6).
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap', style: ['normal', 'italic'], axes: ['opsz'] });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'SecurTex · Editor LaTeX colaborativo seguro', template: '%s · SecurTex' },
  description: 'Escribe LaTeX en equipo con compilación aislada, cifrado por proyecto y autenticación resistente al phishing.',
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
    <html lang="es" suppressHydrationWarning className={`${geist.variable} ${newsreader.variable} ${jetbrains.variable}`}>
      <head>
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
