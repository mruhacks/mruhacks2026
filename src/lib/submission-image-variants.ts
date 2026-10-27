import 'server-only';

import sharp from 'sharp';

import {
  deleteObject,
  objectExists,
  parseSubmissionAttachmentKey,
  putObject,
  submissionAttachmentPrefix,
} from '@/utils/object-storage';
import { collectAttachmentKeys } from '@/lib/markdown-attachments';
import { SUBMISSION_IMAGE_WIDTHS, submissionImageVariantKey } from '@/lib/submission-images';

/** Same decompression-bomb guard as profile pictures and campaign images. */
const MAX_INPUT_PIXELS = 50_000_000;
/** Longer than campaign images: an animated GIF is re-encoded frame by frame, three times. */
const PROCESSING_TIMEOUT_MS = 20_000;

/**
 * Keys are random and an object is never rewritten under the same key, so
 * browsers and any CDN in front of the bucket can keep it forever.
 */
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * The submission's own image keys: everything under its storage prefix that
 * its markdown or cover points at. Anything else a URL might name (another
 * project's image, a wiki attachment) is never this submission's to count
 * or delete.
 */
export function submissionImageKeys(submissionId: string, markdown: string, coverImageUrl: string | null): Set<string> {
  const prefix = submissionAttachmentPrefix(submissionId);
  const keys = new Set([...collectAttachmentKeys(markdown)].filter((key) => key.startsWith(prefix)));
  const coverKey = parseSubmissionAttachmentKey(coverImageUrl);
  if (coverKey?.startsWith(prefix)) keys.add(coverKey);
  return keys;
}

export type SubmissionImageVariant = { width: number; body: Uint8Array };

/**
 * One WebP per `SUBMISSION_IMAGE_WIDTHS` entry: EXIF orientation applied,
 * then every bit of metadata dropped (GPS included — sharp only copies it
 * with `.withMetadata()`), never enlarged. An animated GIF/WebP stays
 * animated. Throws for anything sharp can't decode.
 */
export async function createSubmissionImageVariants(bytes: Uint8Array): Promise<SubmissionImageVariant[]> {
  const work = async () => {
    const { pages = 1 } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    const animated = pages > 1;
    const base = sharp(bytes, { animated, failOn: 'none', limitInputPixels: MAX_INPUT_PIXELS });
    // Animated sources (GIF, WebP) carry no EXIF orientation, and sharp
    // can't auto-orient a multi-page image.
    const oriented = animated ? base : base.rotate();

    return Promise.all(
      SUBMISSION_IMAGE_WIDTHS.map(async (width) => {
        const data = await oriented
          .clone()
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        return { width, body: new Uint8Array(data) };
      }),
    );
  };

  return Promise.race([
    work(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), PROCESSING_TIMEOUT_MS)),
  ]);
}

/** Writes the public, resized copies of the original image stored at `key`. */
export async function putSubmissionImageVariants(key: string, variants: SubmissionImageVariant[]): Promise<void> {
  await Promise.all(
    variants.map(({ width, body }) =>
      putObject({
        key: submissionImageVariantKey(key, width),
        body,
        contentType: 'image/webp',
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    ),
  );
}

/** True when every resized copy of the original at `key` is already stored. */
export async function hasSubmissionImageVariants(key: string): Promise<boolean> {
  const found = await Promise.all(
    SUBMISSION_IMAGE_WIDTHS.map((width) => objectExists(submissionImageVariantKey(key, width))),
  );
  return found.every(Boolean);
}

/** Deletes the original at `key` and all of its resized copies. */
export async function deleteSubmissionImage(key: string): Promise<void> {
  await Promise.all([
    deleteObject(key),
    ...SUBMISSION_IMAGE_WIDTHS.map((width) => deleteObject(submissionImageVariantKey(key, width))),
  ]);
}
