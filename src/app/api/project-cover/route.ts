import { renderProjectCoverSvg } from '@/lib/project-cover-art';

/**
 * Placeholder cover art for projects without one, seeded by the project's
 * name: `/api/project-cover?seed=<name>` (see `projectCoverFallbackUrl`).
 * Public, since the project gallery is.
 */
export function GET(request: Request): Response {
  const seed = new URL(request.url).searchParams.get('seed') ?? 'MRUHACKS';
  return new Response(renderProjectCoverSvg(seed), {
    headers: {
      'Content-Type': 'image/svg+xml',
      // Same seed always renders the same SVG.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
