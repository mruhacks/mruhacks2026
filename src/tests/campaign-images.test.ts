import sharp from 'sharp';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn().mockResolvedValue(null) }));

import { GET } from '@/app/api/assets/[...key]/route';
import {
  CAMPAIGN_IMAGE_MAX_WIDTH,
  optimizeCampaignImage,
} from '@/lib/campaigns/campaign-images';
import { renderCampaignEmail } from '@/lib/campaigns/render-campaign-email';
import {
  campaignImageUrl,
  campaignImageWidth,
  isCampaignImageKey,
  putObject,
} from '@/utils/object-storage';

/** A big "phone photo": 4000×3000, rotated by EXIF orientation 6, with GPS data. */
async function phonePhoto(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width: 4000,
      height: 3000,
      channels: 3,
      background: { r: 200, g: 80, b: 40 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: 'TestPhone' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '51/1 2/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '114/1 4/1 0/1',
      },
    })
    .toBuffer();
  return new Uint8Array(buffer);
}

describe('optimizeCampaignImage', () => {
  test('a 4000px phone photo is stored at most 1200px wide with no EXIF/GPS', async () => {
    const input = await phonePhoto();
    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.exif).toBeDefined();
    expect(inputMeta.orientation).toBe(6);

    const image = await optimizeCampaignImage(input);
    const meta = await sharp(image.body).metadata();

    expect(image.contentType).toBe('image/jpeg');
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBeLessThanOrEqual(CAMPAIGN_IMAGE_MAX_WIDTH);
    // Orientation 6 is a 90° turn: the landscape source comes out portrait.
    expect(meta.height!).toBeGreaterThan(meta.width!);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(image.width).toBe(meta.width);
    expect(isCampaignImageKey(image.key)).toBe(true);
    expect(campaignImageWidth(campaignImageUrl(image.key))).toBe(meta.width);
  });

  test('keeps PNG only when the image has transparency', async () => {
    const transparent = await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const opaquePng = await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 4,
        background: { r: 10, g: 10, b: 10, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const a = await optimizeCampaignImage(new Uint8Array(transparent));
    expect(a.contentType).toBe('image/png');
    expect(a.key).toMatch(/-w300\.png$/);
    // Never enlarged.
    expect(a.width).toBe(300);

    const b = await optimizeCampaignImage(new Uint8Array(opaquePng));
    expect(b.contentType).toBe('image/jpeg');
    expect(b.key).toMatch(/\.jpg$/);
  });

  test('rejects data that is not an image', async () => {
    await expect(
      optimizeCampaignImage(new TextEncoder().encode('not an image')),
    ).rejects.toThrow();
  });
});

describe('/api/assets campaign images', () => {
  test('redirects to a signed URL with no session', async () => {
    const image = await optimizeCampaignImage(await phonePhoto());
    await putObject({
      key: image.key,
      body: image.body,
      contentType: image.contentType,
    });

    const response = await GET(new Request('http://localhost/'), {
      params: Promise.resolve({ key: image.key.split('/') }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain(image.key);
    expect(response.headers.get('cache-control')).toMatch(/^public/);
  });

  test('a key outside the pattern is not served', async () => {
    const response = await GET(new Request('http://localhost/'), {
      params: Promise.resolve({
        key: ['campaign-content', '..', 'resumes', 'x.pdf'],
      }),
    });
    expect(response.status).toBe(404);
  });
});

describe('campaign email image widths', () => {
  test('uploads get their stored width (capped to the column); external images get none', async () => {
    const small = campaignImageUrl(
      'campaign-content/9f0d6a52-2c55-4f6e-9a0e-5d1f3b6b7c8d-w300.jpg',
    );
    const big = campaignImageUrl(
      'campaign-content/9f0d6a52-2c55-4f6e-9a0e-5d1f3b6b7c8e-w1200.jpg',
    );
    const email = await renderCampaignEmail(
      {
        type: 'marketing',
        subject: 's',
        previewText: '',
        bodyMarkdown: `![a](${small})\n\n![b](${big})\n\n![c](https://cdn.example.com/x.png)`,
        eventName: null,
      },
      { firstName: null },
      { baseUrl: 'https://app.example.com' },
    );
    expect(email.html).toMatch(
      /alt="a"[^>]*width="300"|width="300"[^>]*alt="a"/,
    );
    expect(email.html).toMatch(
      /alt="b"[^>]*width="520"|width="520"[^>]*alt="b"/,
    );
    expect(email.html).toMatch(/<img[^>]*alt="c"(?![^>]*width=)[^>]*>/);
  });
});
