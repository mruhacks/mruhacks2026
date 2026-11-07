import { describe, expect, test } from 'vitest';

import { GET } from '@/app/api/project-cover/route';
import { staticProjectCoverFile } from '@/content';
import { renderProjectCoverSvg } from '@/lib/project-cover-art';

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

describe('static export covers', () => {
  test('draw the same art as the API', async () => {
    const long = 'x'.repeat(300);
    expect(renderProjectCoverSvg('Alpha')).toBe(await cover('Alpha').text());
    expect(renderProjectCoverSvg(long)).toBe(await cover(long).text());
  });

  test('get a stable filename any static host can serve, whatever the title', () => {
    for (const title of ['Alpha', 'Ünïcode / slashes & "quotes" — 🚀', '../../etc/passwd', '']) {
      expect(staticProjectCoverFile(title)).toMatch(/^[0-9a-f]{8}\.svg$/);
      expect(staticProjectCoverFile(title)).toBe(staticProjectCoverFile(title));
    }
    expect(staticProjectCoverFile('Alpha')).not.toBe(staticProjectCoverFile('Beta'));
  });
});
