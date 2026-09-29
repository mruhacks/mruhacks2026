import { describe, test, expect } from 'vitest';
import {
  RESERVED_EVENT_SLUGS,
  adminEventPath,
  eventPath,
  isEventUuid,
  isValidEventSlug,
} from '@/lib/event-slug';
import { SLUG_MAX_LENGTH } from '@/lib/slug';

const UUID = '3f0c9b4e-1d2a-4c5b-8e7f-0a1b2c3d4e5f';

describe('isEventUuid', () => {
  test('recognizes a uuid in either case', () => {
    expect(isEventUuid(UUID)).toBe(true);
    expect(isEventUuid(UUID.toUpperCase())).toBe(true);
  });

  test('rejects a slug, including one built only from hex words', () => {
    expect(isEventUuid('mruhacks-2026')).toBe(false);
    expect(isEventUuid('dead-beef')).toBe(false);
  });
});

describe('isValidEventSlug', () => {
  test('accepts an ordinary hyphenated slug', () => {
    expect(isValidEventSlug('mruhacks-2026')).toBe(true);
  });

  test('rejects a uuid, which the route resolves as an id instead', () => {
    expect(isValidEventSlug(UUID)).toBe(false);
  });

  test.each(RESERVED_EVENT_SLUGS)(
    'rejects %s, shadowed by the sibling route',
    (reserved) => {
      expect(isValidEventSlug(reserved)).toBe(false);
    },
  );

  test.each([
    ['', 'empty'],
    ['Upper', 'uppercase'],
    ['has space', 'space'],
    ['slash/es', 'path separator'],
    ['a'.repeat(SLUG_MAX_LENGTH + 1), 'over the length limit'],
  ])('rejects %s (%s)', (slug) => {
    expect(isValidEventSlug(slug)).toBe(false);
  });
});

describe('eventPath', () => {
  test('prefers the slug when the event has one', () => {
    expect(eventPath({ id: UUID, slug: 'mruhacks-2026' })).toBe(
      '/dashboard/events/mruhacks-2026',
    );
  });

  test('falls back to the id when the slug is null or absent', () => {
    expect(eventPath({ id: UUID, slug: null })).toBe(
      `/dashboard/events/${UUID}`,
    );
    expect(eventPath({ id: UUID })).toBe(`/dashboard/events/${UUID}`);
  });
});

describe('adminEventPath', () => {
  test('prefers the slug when the event has one', () => {
    expect(adminEventPath({ id: UUID, slug: 'mruhacks-2026' })).toBe(
      '/dashboard/admin/events/mruhacks-2026',
    );
  });

  test('falls back to the id when there is no slug', () => {
    expect(adminEventPath({ id: UUID, slug: null })).toBe(
      `/dashboard/admin/events/${UUID}`,
    );
  });
});
