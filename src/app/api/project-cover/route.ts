import { Avatar, Style } from '@dicebear/core';
import definition from '@dicebear/styles/shapes.json';

const style = new Style(definition);

/**
 * Placeholder cover art for projects without one, seeded by the project's
 * name: `/api/project-cover?seed=<name>` (see `projectCoverFallbackUrl`).
 * Public, since the project gallery is.
 */
/** Longer seeds are cut, so arbitrary input can't make each render costlier. */
const MAX_SEED_LENGTH = 128;

export function GET(request: Request): Response {
  const seed = (new URL(request.url).searchParams.get('seed') ?? 'MRUHACKS').slice(0, MAX_SEED_LENGTH);
  const svg = new Avatar(style, {
    seed,
    backgroundColor: ['#FEF7D2', '#FBDECC', '#FAD8D3', '#F5D0E8', '#DAD0FA', '#D3DDFB', '#E4FFFF'],
    shape1Color: ['#DAD0FA', '#D3DDFB', '#E4FFFF'],
    shape2Color: ['#FEF7D2', '#FBDECC', '#FAD8D3'],
    shape3Color: ['#F5D0E8'],
  }).toString();
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      // Same seed always renders the same SVG.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
