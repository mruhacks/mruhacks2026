import sharp from 'sharp';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PutBucketPolicyCommand } from '@aws-sdk/client-s3';

// Every command the storage client sends, so the bucket policy it sets up can be read back.
const sentCommands = vi.hoisted(() => [] as unknown[]);
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: class {
      async send(command: unknown) {
        sentCommands.push(command);
        return {};
      }
    },
  };
});

import { createSubmissionImageVariants } from '@/lib/submission-image-variants';
import { SUBMISSION_IMAGE_WIDTHS, submissionImageSources, submissionImageVariantKey } from '@/lib/submission-images';
import { putObject } from '@/utils/object-storage';

const SUBMISSION_ID = '3f0d5b4e-1c2a-4f6b-8d9e-0a1b2c3d4e5f';
const FILE_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';
const KEY = `submission-content/${SUBMISSION_ID}/${FILE_ID}.png`;

/** A big "phone photo": 4000×3000, rotated by EXIF orientation 6, with GPS data. */
async function phonePhoto(): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#c85028' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 2/1 0/1' } })
    .toBuffer();
  return new Uint8Array(buffer);
}

describe('submissionImageVariantKey', () => {
  test('swaps the extension for the width and .webp', () => {
    expect(submissionImageVariantKey(KEY, 960)).toBe(`submission-content/${SUBMISSION_ID}/${FILE_ID}-w960.webp`);
  });

  test('every copy is covered by the public-read policy, and the original is not', async () => {
    // A MinIO-style endpoint is the one setup where the app applies the policy itself.
    vi.stubEnv('S3_BUCKET', 'bucket');
    vi.stubEnv('S3_REGION', 'us-east-1');
    vi.stubEnv('S3_ENDPOINT', 'http://localhost:9000');
    await putObject({ key: KEY, body: new Uint8Array(), contentType: 'image/png' });
    vi.unstubAllEnvs();
    const policy = sentCommands.find(
      (command): command is PutBucketPolicyCommand => command instanceof PutBucketPolicyCommand,
    );
    const [resource] = JSON.parse(policy!.input.Policy!).Statement[0].Resource as string[];
    const pattern = new RegExp(`^${resource.replace('arn:aws:s3:::bucket/', '').replaceAll('*', '.*')}$`);
    for (const width of SUBMISSION_IMAGE_WIDTHS) {
      expect(submissionImageVariantKey(KEY, width)).toMatch(pattern);
    }
    expect(KEY).not.toMatch(pattern);
  });
});

describe('submissionImageSources', () => {
  afterEach(() => vi.unstubAllEnvs());

  test('points a submission image at its public copies', () => {
    vi.stubEnv('PUBLIC_ASSETS_BASE_URL', 'https://cdn.example.com');
    const sources = submissionImageSources(`/api/assets/${KEY}`);
    expect(sources?.src).toBe(`https://cdn.example.com/${submissionImageVariantKey(KEY, 960)}`);
    expect(sources?.srcSet.split(', ')).toEqual(
      SUBMISSION_IMAGE_WIDTHS.map(
        (width) => `https://cdn.example.com/${submissionImageVariantKey(KEY, width)} ${width}w`,
      ),
    );
  });

  test('leaves anything else alone', () => {
    vi.stubEnv('PUBLIC_ASSETS_BASE_URL', 'https://cdn.example.com');
    expect(submissionImageSources(`/api/assets/event-content/${SUBMISSION_ID}/${FILE_ID}.png`)).toBeNull();
    expect(submissionImageSources('https://example.com/a.png')).toBeNull();
    expect(submissionImageSources(null)).toBeNull();
  });

  test('falls back to the bucket URL without a CDN override', () => {
    vi.stubEnv('PUBLIC_ASSETS_BASE_URL', '');
    vi.stubEnv('S3_PUBLIC_BASE_URL', '');
    vi.stubEnv('S3_ENDPOINT', '');
    vi.stubEnv('S3_BUCKET', 'mruhacks-assets');
    vi.stubEnv('S3_REGION', 'ca-central-1');
    expect(submissionImageSources(`/api/assets/${KEY}`)?.src).toBe(
      `https://mruhacks-assets.s3.ca-central-1.amazonaws.com/${submissionImageVariantKey(KEY, 960)}`,
    );
  });
});

describe('createSubmissionImageVariants', () => {
  test('a 4000px phone photo becomes upright WebPs at each width, with no EXIF/GPS', async () => {
    const variants = await createSubmissionImageVariants(await phonePhoto());
    expect(variants.map(({ width }) => width)).toEqual([...SUBMISSION_IMAGE_WIDTHS]);
    for (const { width, body } of variants) {
      const meta = await sharp(body).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(width);
      // Orientation 6 is a 90° turn: portrait once applied.
      expect(meta.height).toBeGreaterThan(width);
      expect(meta.exif).toBeUndefined();
    }
  });

  test('never enlarges a small image', async () => {
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#000000' } })
      .png()
      .toBuffer();
    const variants = await createSubmissionImageVariants(new Uint8Array(small));
    for (const { body } of variants) {
      expect((await sharp(body).metadata()).width).toBe(300);
    }
  });

  test('keeps an animated GIF animated', async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 1200, height: 800, channels: 3, background } })
        .png()
        .toBuffer();
    const gif = await sharp(await Promise.all(['#ff0000', '#00ff00', '#0000ff'].map(frame)), {
      join: { animated: true },
    })
      .gif()
      .toBuffer();
    expect((await sharp(gif).metadata()).pages).toBe(3);

    const variants = await createSubmissionImageVariants(new Uint8Array(gif));
    for (const { width, body } of variants) {
      const meta = await sharp(body, { animated: true }).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.pages).toBe(3);
      expect(meta.width).toBe(Math.min(width, 1200));
    }
  });

  test('rejects bytes that are not an image', async () => {
    await expect(createSubmissionImageVariants(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
