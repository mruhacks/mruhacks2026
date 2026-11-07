import { describe, expect, test } from 'vitest';

import staticImageLoader from '@/lib/static-image-loader';

describe('staticImageLoader', () => {
  test('points local images at a pre-resized WebP that postbuild.ts renders', () => {
    expect(staticImageLoader({ src: '/_next/static/media/logo.abc123.png', width: 640, quality: 75 })).toBe(
      '/_img/640/75/_next/static/media/logo.abc123.png.webp',
    );
    expect(staticImageLoader({ src: '/stats-card-image1.png', width: 1080 })).toBe(
      '/_img/1080/75/stats-card-image1.png.webp',
    );
  });

  test('passes SVGs and remote images through, like the default loader', () => {
    expect(staticImageLoader({ src: '/_next/static/media/hero.svg', width: 640 })).toBe('/_next/static/media/hero.svg');
    expect(staticImageLoader({ src: 'https://example.com/a.png', width: 640 })).toBe('https://example.com/a.png');
  });
});
