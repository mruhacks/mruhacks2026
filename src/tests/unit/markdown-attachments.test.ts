import { describe, test, expect } from 'vitest';
import { collectAttachmentKeys } from '@/lib/markdown-attachments';
import {
  eventAttachmentUrl,
  isEventAttachmentKey,
  isSubmissionAttachmentKey,
  parseEventAttachmentKey,
  parseSubmissionAttachmentKey,
  submissionAttachmentPrefix,
} from '@/utils/object-storage';

const EVENT_ID = '3f0d5b4e-1c2a-4f6b-8d9e-0a1b2c3d4e5f';
const FILE_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';
const KEY = `event-content/${EVENT_ID}/${FILE_ID}.webp`;
const SUBMISSION_KEY = `${submissionAttachmentPrefix(EVENT_ID)}${FILE_ID}.png`;

describe('isEventAttachmentKey', () => {
  test('accepts the key shape the upload action writes', () => {
    expect(isEventAttachmentKey(KEY)).toBe(true);
  });

  test.each<[string | null, string]>([
    [null, 'null'],
    ['', 'empty'],
    ['profile-pictures/x/y.webp', 'another prefix'],
    [`event-content/${EVENT_ID}/${FILE_ID}`, 'no extension'],
    [`event-content/${EVENT_ID}/../../secrets.txt`, 'traversal-shaped'],
    [`event-content/${EVENT_ID}/${FILE_ID}.webp/extra`, 'trailing segment'],
  ])('rejects %s (%s)', (value) => {
    expect(isEventAttachmentKey(value)).toBe(false);
  });
});

describe('eventAttachmentUrl / parseEventAttachmentKey', () => {
  test('round-trips a key through its URL', () => {
    expect(parseEventAttachmentKey(eventAttachmentUrl(KEY))).toBe(KEY);
  });

  test('ignores URLs that are not attachment assets', () => {
    expect(
      parseEventAttachmentKey('/api/assets/profile-pictures/a/b.webp'),
    ).toBe(null);
    expect(parseEventAttachmentKey('https://example.com/image.png')).toBe(null);
    expect(parseEventAttachmentKey(null)).toBe(null);
  });
});

describe('collectAttachmentKeys', () => {
  test('finds keys behind markdown image syntax', () => {
    expect([...collectAttachmentKeys(`![map](/api/assets/${KEY})`)]).toEqual([
      KEY,
    ]);
  });

  test('finds keys in autolinks and raw img tags', () => {
    const markdown = `<${eventAttachmentUrl(KEY)}>\n<img src="/api/assets/${KEY}">`;
    expect([...collectAttachmentKeys(markdown)]).toEqual([KEY]);
  });

  test('deduplicates repeated references', () => {
    const markdown = `![a](/api/assets/${KEY}) and ![b](/api/assets/${KEY})`;
    expect(collectAttachmentKeys(markdown).size).toBe(1);
  });

  test('normalizes hand-edited uppercase hex to the stored key', () => {
    const markdown = `![a](/api/assets/event-content/${EVENT_ID.toUpperCase()}/${FILE_ID}.webp)`;
    expect([...collectAttachmentKeys(markdown)]).toEqual([KEY]);
  });

  test('returns nothing for markdown with no attachments', () => {
    expect(collectAttachmentKeys('# Title\n\nJust text.').size).toBe(0);
    expect(collectAttachmentKeys(null).size).toBe(0);
  });

  test('ignores assets served from other prefixes', () => {
    expect(
      collectAttachmentKeys('![a](/api/assets/profile-pictures/a/b.webp)').size,
    ).toBe(0);
  });
});

describe('submission attachments', () => {
  test('submission keys have their own shape and parser', () => {
    expect(SUBMISSION_KEY).toBe(
      `submission-content/${EVENT_ID}/${FILE_ID}.png`,
    );
    expect(isSubmissionAttachmentKey(SUBMISSION_KEY)).toBe(true);
    expect(isEventAttachmentKey(SUBMISSION_KEY)).toBe(false);
    expect(isSubmissionAttachmentKey(KEY)).toBe(false);
    expect(
      parseSubmissionAttachmentKey(eventAttachmentUrl(SUBMISSION_KEY)),
    ).toBe(SUBMISSION_KEY);
    expect(parseSubmissionAttachmentKey(eventAttachmentUrl(KEY))).toBe(null);
  });

  test('collectAttachmentKeys matches both prefixes', () => {
    const markdown = `![a](/api/assets/${KEY}) ![b](/api/assets/${SUBMISSION_KEY})`;
    expect([...collectAttachmentKeys(markdown)].sort()).toEqual(
      [KEY, SUBMISSION_KEY].sort(),
    );
  });
});
