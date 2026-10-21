import { describe, expect, test } from 'vitest';

import { scrubTelemetryUrl } from '@/lib/scrub-telemetry-url';

describe('scrubTelemetryUrl', () => {
  test('drops the token and keeps everything else', () => {
    expect(
      scrubTelemetryUrl(
        'https://mruhacks.ca/signin/verify?token=secret&callbackURL=%2Fwelcome&link=magic-link',
      ),
    ).toBe(
      'https://mruhacks.ca/signin/verify?callbackURL=%2Fwelcome&link=magic-link',
    );
  });

  test('leaves URLs without a token untouched', () => {
    const url = 'https://mruhacks.ca/dashboard?tab=events';
    expect(scrubTelemetryUrl(url)).toBe(url);
  });
});
