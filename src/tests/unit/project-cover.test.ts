import { describe, expect, test } from 'vitest';

import { GET } from '@/app/api/project-cover/route';

const cover = (seed: string) => GET(new Request(`http://localhost/api/project-cover?seed=${seed}`));

describe('GET /api/project-cover', () => {
  test('serves a cacheable SVG', () => {
    const response = cover('Alpha');
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  test('the same seed always draws the same art, a different seed different art', async () => {
    const [first, again, other] = await Promise.all(
      [cover('Alpha'), cover('Alpha'), cover('Beta')].map((r) => r.text()),
    );
    expect(first).toMatch(/^<svg/);
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });
});
