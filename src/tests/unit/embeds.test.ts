/**
 * The embed allow-list is the security boundary for wiki iframes, and it also
 * generates the CSP `frame-src` — so both its accept/reject decisions and its
 * CSP output are pinned here.
 */
import { describe, test, expect } from 'vitest';
import {
  embedFrameSources,
  getAllowedEmbedSrc,
  parseEmbedDimension,
  serializeEmbedHtml,
  toEmbedUrl,
} from '@/lib/embeds';

describe('getAllowedEmbedSrc', () => {
  test.each([
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://player.vimeo.com/video/76979871',
    'https://www.google.com/maps/embed?pb=!1m18',
    'https://docs.google.com/forms/d/e/abc/viewform?embedded=true',
    'https://embed.figma.com/design/abc',
  ])('accepts %s', (src) => {
    expect(getAllowedEmbedSrc(src)).toBe(src);
  });

  test.each([
    '/api/assets/x',
    '//www.youtube.com/embed/x',
    'http://www.youtube.com/embed/x',
    'https://www.youtube.com/watch?v=x',
    'https://www.google.com/maps/embedded',
    'https://user:pw@docs.google.com/x',
    'https://docs.google.com.evil.test/x',
    'data:text/html,<script>alert(1)</script>',
    'javascript:alert(1)',
    undefined,
  ])('rejects %s', (src) => {
    expect(getAllowedEmbedSrc(src)).toBeNull();
  });
});

describe('toEmbedUrl', () => {
  test.each([
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ],
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
    ['https://www.loom.com/share/abc123', 'https://www.loom.com/embed/abc123'],
    [
      '<iframe width="560" src="https://www.google.com/maps/embed?pb=1&amp;x=2" allowfullscreen></iframe>',
      'https://www.google.com/maps/embed?pb=1&x=2',
    ],
  ])('normalizes %s', (input, expected) => {
    expect(toEmbedUrl(input)).toBe(expected);
  });
});

test('parseEmbedDimension accepts only plain pixel integers', () => {
  expect(parseEmbedDimension('315')).toBe(315);
  expect(parseEmbedDimension('100%')).toBeUndefined();
  expect(parseEmbedDimension('0')).toBeUndefined();
  expect(parseEmbedDimension('99999')).toBeUndefined();
});

test('serializeEmbedHtml writes a paired, escaped tag', () => {
  expect(
    serializeEmbedHtml({
      src: 'https://docs.google.com/a?b=1&c=2',
      title: 'Say "hi"',
      width: 400,
    }),
  ).toBe(
    '<iframe src="https://docs.google.com/a?b=1&amp;c=2" title="Say &quot;hi&quot;" width="400"></iframe>',
  );
});

test('every CSP frame source is https and matches the allow-list shape', () => {
  const sources = embedFrameSources();
  expect(sources).toContain('https://www.youtube-nocookie.com/embed/');
  expect(sources).toContain('https://docs.google.com');
  for (const source of sources) expect(source).toMatch(/^https:\/\/[^\s;']+$/);
});
