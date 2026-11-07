/**
 * `next/image` loader for the static export (`pnpm build:static`), where
 * there's no server to resize images on request. It points each srcset
 * entry at a pre-resized WebP that `scripts/static-export/postbuild.ts`
 * generates by scanning the exported HTML for these URLs, so the two must
 * agree on the `/_img/<width>/<quality>/<src>.webp` shape (`parseImageUrl`).
 *
 * Remote images and SVGs pass through untouched, as the default loader does.
 */
export default function staticImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (!src.startsWith('/') || src.endsWith('.svg')) return src;
  return `/_img/${width}/${quality ?? 75}${src}.webp`;
}
