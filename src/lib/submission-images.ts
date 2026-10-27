/**
 * Resized, public copies of project submission images.
 *
 * Every submission image (cover or inline) is uploaded once as an original,
 * at `submission-content/<submissionId>/<uuid><ext>`, which stays private and
 * is served through `/api/assets`. Next to it the upload writes one WebP per
 * width in `SUBMISSION_IMAGE_WIDTHS`, at `…/<uuid>-w<width>.webp`, with EXIF
 * (GPS included) stripped. The bucket policy makes exactly those keys
 * publicly readable (see docs/OBJECT_STORAGE.md), so pages load them straight
 * from storage with a `srcset` — no `/api/assets` hop, no presigned URL that
 * changes on every request, and an immutable cache header.
 *
 * Client-safe: the editor renders covers too. The public base URL is inlined
 * at build time by `next.config.ts`; on the server it's read from env.
 */

import { readPublicAssetsBaseUrl } from '@/lib/object-storage-endpoint';

/** Ascending. The largest is about 2× the widest place an image is shown (the project page). */
export const SUBMISSION_IMAGE_WIDTHS = [480, 960, 1600] as const;

/**
 * Submission images are always `submission-content/<submissionId>/<uuid><ext>`
 * — the same shape as event attachments, keyed by the submission so deleting
 * a project can tell exactly which objects were its own.
 */
export const SUBMISSION_ATTACHMENT_KEY_PATTERN = /^submission-content\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/;

/** The key of one resized copy of the original at `key`. */
export function submissionImageVariantKey(key: string, width: number): string {
  return `${key.slice(0, key.lastIndexOf('.'))}-w${width}.webp`;
}

export type ResponsiveImageSources = { src: string; srcSet: string };

/**
 * `src`/`srcSet` for a submission image's public copies, or null when `url`
 * isn't a submission image (e.g. a wiki attachment) or no public base URL is
 * configured — callers then fall back to `url` itself.
 */
export function submissionImageSources(url: string | null | undefined): ResponsiveImageSources | null {
  const prefix = '/api/assets/';
  if (!url?.startsWith(prefix)) return null;
  const key = url.slice(prefix.length).toLowerCase();
  if (!SUBMISSION_ATTACHMENT_KEY_PATTERN.test(key)) return null;

  const base = process.env.PUBLIC_ASSETS_BASE_URL || readPublicAssetsBaseUrl();
  if (!base) return null;

  const variantUrl = (width: number) => `${base}/${submissionImageVariantKey(key, width)}`;
  return {
    src: variantUrl(SUBMISSION_IMAGE_WIDTHS[1]),
    srcSet: SUBMISSION_IMAGE_WIDTHS.map((width) => `${variantUrl(width)} ${width}w`).join(', '),
  };
}

/**
 * A tiny object under the public pattern, written by
 * `pnpm images:backfill`, that `/api/health` fetches unsigned to prove the
 * bucket policy really lets anyone read the resized copies.
 */
export const PUBLIC_IMAGE_PROBE_KEY = 'submission-content/health-probe-w1.webp';
