import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Las imágenes del proyecto se sirven desde el propio origen; ningún dominio externo.
  images: { remotePatterns: [] },
  experimental: { optimizePackageImports: ['lucide-react', 'radix-ui'] },
};

export default config;
