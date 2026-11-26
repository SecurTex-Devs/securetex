import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Las imágenes del proyecto se sirven desde el propio origen; ningún dominio externo.
  images: { remotePatterns: [] },
  async headers() {
    return [{ source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }];
  },
  experimental: { optimizePackageImports: ['lucide-react', 'radix-ui'] },
};

export default config;
