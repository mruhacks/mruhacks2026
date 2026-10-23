import 'server-only';

import { randomUUID } from 'crypto';
import sharp from 'sharp';

import { campaignImageKey } from '@/utils/object-storage';

/** Largest upload accepted, before optimization. */
export const MAX_CAMPAIGN_IMAGE_BYTES = 5 * 1024 * 1024;
/** Stored images are never wider than this: 2× the email body column, for retina. */
export const CAMPAIGN_IMAGE_MAX_WIDTH = 1200;

/** Same decompression-bomb guard and time limit as profile pictures. */
const MAX_INPUT_PIXELS = 50_000_000;
const PROCESSING_TIMEOUT_MS = 8000;

/**
 * Formats sharp can decode that an organizer might reasonably drop in. The
 * output is always JPEG or PNG regardless: WebP and AVIF don't render in
 * Outlook. SVG is refused — it can carry script.
 */
export const CAMPAIGN_IMAGE_INPUT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
]);

export type OptimizedCampaignImage = {
  key: string;
  body: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
  width: number;
};

/**
 * Re-encodes an upload for email: applies the EXIF orientation then drops
 * every bit of metadata (GPS included — sharp only copies it with
 * `.withMetadata()`), shrinks to at most 1200px wide, and writes JPEG q80, or
 * PNG when the image actually uses transparency.
 */
export async function optimizeCampaignImage(bytes: Uint8Array): Promise<OptimizedCampaignImage> {
  const work = async () => {
    const base = sharp(bytes, {
      failOn: 'none',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({ width: CAMPAIGN_IMAGE_MAX_WIDTH, withoutEnlargement: true });

    const { isOpaque } = await base.clone().stats();
    const transparent = !isOpaque;
    const { data, info } = await (
      transparent
        ? base.png({ compressionLevel: 9, palette: true })
        : base.flatten({ background: '#ffffff' }).jpeg({
            quality: 80,
            mozjpeg: true,
          })
    ).toBuffer({ resolveWithObject: true });

    const contentType = transparent ? 'image/png' : 'image/jpeg';
    return {
      key: campaignImageKey(randomUUID(), info.width, contentType),
      body: new Uint8Array(data),
      contentType,
      width: info.width,
    } as const;
  };

  return Promise.race([
    work(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), PROCESSING_TIMEOUT_MS)),
  ]);
}
