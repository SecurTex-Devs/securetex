import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Las imágenes del proyecto se sirven desde el propio origen; ningún dominio externo.
  images: { remotePatterns: [] },
  async headers() {
    return [
      { source: '/:path*', headers: [
        // Los workers de PDF.js importan otros chunks propios; no necesitan eval ni scripts en línea.
        // La política con nonce del middleware sustituye esta reserva en las páginas.
        { key: 'Content-Security-Policy', value: "default-src 'none'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ] },
      { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
  experimental: { optimizePackageImports: ['lucide-react', 'radix-ui'] },
};

export default config;
