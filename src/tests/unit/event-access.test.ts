import { describe, expect, test } from 'vitest';

import { canOpenEventDashboard } from '@/lib/rbac/event-access';

describe('canOpenEventDashboard', () => {
  test('a check-in volunteer can open it', () => {
    expect(
      canOpenEventDashboard(['participant:read:all', 'checkin:write:all']),
    ).toBe(true);
  });

  test.each([
    'application:read:all',
    'application:vote:all',
    'application:stats:all',
    'team:read:all',
    'rsvp:read:all',
    'article:read:all',
    'event:manage:all',
  ])('%s alone is enough', (slug) => {
    expect(canOpenEventDashboard([slug])).toBe(true);
  });

  test('wildcard grants count', () => {
    expect(canOpenEventDashboard(['all:all:all'])).toBe(true);
    expect(canOpenEventDashboard(['checkin:all:all'])).toBe(true);
  });

  test('permissions that gate nothing under an event do not', () => {
    expect(canOpenEventDashboard([])).toBe(false);
    expect(
      canOpenEventDashboard([
        'participant:read:all',
        'user:read:all',
        'role:read:all',
        'team:manage:all',
      ]),
    ).toBe(false);
  });
});
