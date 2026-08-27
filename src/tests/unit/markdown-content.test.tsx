/**
 * Rendering and sanitization tests for the read-only markdown renderer.
 *
 * The renderer parses raw HTML because MDXEditor emits it — a resized image
 * becomes `<img width= height=>`, which `![]()` syntax cannot express. That
 * makes the sanitizer load-bearing rather than belt-and-braces, so the unsafe
 * cases below are the point of this file, not an afterthought.
 */
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownContent } from '@/components/markdown/markdown-content';

const render = (markdown: string) =>
  renderToStaticMarkup(<MarkdownContent markdown={markdown} />);

const ATTACHMENT_SRC =
  '/api/assets/event-content/a0d4c82f-c7b5-4064-8515-1cf235a15e4c/bb383d2c-1cdc-4c73-a4a9-250fde4aa24f.png';

describe('images', () => {
  test('renders a resized image written as raw HTML by the editor', () => {
    const html = render(
      `<img height="257" width="206" src="${ATTACHMENT_SRC}" />`,
    );
    expect(html).toContain(`src="${ATTACHMENT_SRC}"`);
    expect(html).toContain('width="206"');
    expect(html).toContain('height="257"');
    // The bug this guards: the tag showing up as escaped text instead.
    expect(html).not.toContain('&lt;img');
  });

  test('renders a plain markdown image', () => {
    const html = render(`![a map](${ATTACHMENT_SRC})`);
    expect(html).toContain(`src="${ATTACHMENT_SRC}"`);
    expect(html).toContain('alt="a map"');
  });

  test('lazy-loads images and never emits a null src', () => {
    const html = render(`![](${ATTACHMENT_SRC})`);
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('src="null"');
  });
});

test('does not leak react-markdown internals onto the DOM', () => {
  // The `node` prop passed to custom components is not a DOM attribute; if it
  // reaches the element it serializes as `node="[object Object]"`.
  const html = render(
    `<img width="206" src="${ATTACHMENT_SRC}">\n\n[link](/dashboard)`,
  );
  expect(html).not.toContain('node=');
});

describe('markdown features', () => {
  test('renders GFM tables', () => {
    const html = render('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  test('renders GFM task lists with their checkboxes', () => {
    const html = render('- [ ] todo\n- [x] done');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
  });

  test('renders fenced code blocks', () => {
    const html = render('```python\nprint("hi")\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('print(');
  });

  test('opens external links in a new tab but keeps internal ones in place', () => {
    expect(render('[out](https://example.com)')).toContain('target="_blank"');
    expect(render('[in](/dashboard/events)')).not.toContain('target="_blank"');
  });
});

describe('sanitization', () => {
  test('drops script tags', () => {
    const html = render('<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  test('strips inline event handlers from otherwise allowed tags', () => {
    const html = render(`<img src="${ATTACHMENT_SRC}" onerror="alert(1)">`);
    expect(html).toContain(`src="${ATTACHMENT_SRC}"`);
    expect(html).not.toContain('onerror');
  });

  test('drops iframes', () => {
    const html = render('<iframe src="https://evil.test"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  test('drops javascript: URLs in links', () => {
    const html = render('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  test('drops data: URLs in images', () => {
    const html = render('<img src="data:text/html;base64,PHNjcmlwdD4=">');
    expect(html).not.toContain('data:text/html');
  });

  test('strips style attributes that could cover the page', () => {
    const html = render('<p style="position:fixed;inset:0;z-index:9999">x</p>');
    expect(html).not.toContain('position:fixed');
  });
});
