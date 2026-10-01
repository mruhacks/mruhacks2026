import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { LocalDateRange } from '@/components/local-date-time';

const start = '2026-09-30T20:00:00Z';
const render = (end: string | null, weekday?: 'long') =>
  renderToStaticMarkup(createElement(LocalDateRange, { start, end, weekday }));

test('renders both times on the same day, using the deterministic SSR zone', () => {
  const html = render('2026-09-30T21:30:00Z');
  expect(html).toContain('2:00 PM');
  expect(html).toContain('3:30 PM');
});
test('renders a start time without an end and both times across days', () => {
  expect(render(null)).toContain('2:00 PM');
  const html = render('2026-10-01T21:30:00Z');
  expect(html).toContain('2:00 PM');
  expect(html).toContain('3:30 PM');
  expect(html).toContain('Oct 1');
});
test('uses weekday names on schedules', () => {
  const html = render(null, 'long');
  expect(html).toContain('Wednesday');
  expect(html).toContain('2:00 PM');
  expect(html).not.toContain('Sep');
});

test('rows under weekday headings show times, while overnight ends identify the next day', () => {
  const sameDay = renderToStaticMarkup(
    createElement(LocalDateRange, {
      start,
      end: '2026-09-30T21:30:00Z',
      timeOnly: true,
    }),
  );
  expect(sameDay).toContain('2:00 PM');
  expect(sameDay).toContain('3:30 PM');
  expect(sameDay).not.toContain('Sep');
  const overnight = renderToStaticMarkup(
    createElement(LocalDateRange, {
      start,
      end: '2026-10-01T21:30:00Z',
      timeOnly: true,
    }),
  );
  expect(overnight).toContain('Thursday');
  expect(overnight).toContain('3:30 PM');
});
