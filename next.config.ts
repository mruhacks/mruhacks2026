import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/signin',
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      // GitHub avatars (OAuth + faker seed data)
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      // Faker portrait CDN
      { protocol: 'https', hostname: 'cdn.jsdelivr.net' },
      // Google OAuth profile photos
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  cacheComponents: true,
};

export default nextConfig;
