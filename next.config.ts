import type { NextConfig } from 'next';
import { execSync } from 'child_process';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * `/api/assets` and `/api/profile/resume` 302 straight to a presigned URL on
 * the configured object-storage endpoint, so the browser loads/downloads
 * that origin directly (not through the app server) — it has to be allowed
 * by CSP or the redirect gets blocked client-side.
 */
function getObjectStorageOrigin(): string | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (!endpoint) return null;
  try {
    return new URL(endpoint).origin;
  } catch {
    return null;
  }
}

/**
 * Captured at build time (not runtime) since deployed environments typically
 * don't ship a `.git` directory or the `git` binary.
 */
function getBuildInfo(): string {
  try {
    return execSync('git describe --long --always', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const nextConfig: NextConfig = {
  async headers() {
    const s3Origin = getObjectStorageOrigin();
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-eval' is dev-only: Turbopack/React use eval() for HMR and
              // debugging call stacks. Never present in production builds.
              `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ''}`,
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: https://avatars.githubusercontent.com https://cdn.jsdelivr.net https://lh3.googleusercontent.com${s3Origin ? ` ${s3Origin}` : ''}`,
              "font-src 'self' data:",
              `connect-src 'self' https://challenges.cloudflare.com${s3Origin ? ` ${s3Origin}` : ''}`,
              // Cloudflare Turnstile renders its challenge in an iframe from this origin.
              'frame-src https://challenges.cloudflare.com',
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
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
  outputFileTracingIncludes: {
    '/api/wallet/pass/[eventId]': ['./src/lib/wallet/mruhacks.pass/**'],
  },
  cacheComponents: true,
  // Lets `<Link>` prefetch each route's cached/static App Shell instead of
  // nothing (dynamic routes) or a full uncached render. See AGENTS.md.
  partialPrefetching: true,
  env: {
    BUILD_INFO: getBuildInfo(),
  },
  allowedDevOrigins: ['thomas-desktop.local'],
};

export default nextConfig;
