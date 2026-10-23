import { describe, expect, test } from 'vitest';

import * as Rbac from '@/lib/rbac';

describe('canOpenEventDashboard', () => {
  test('a check-in volunteer can open it', () => {
    expect(Rbac.canOpenEventDashboard(['participant:read:all', 'checkin:write:all'])).toBe(true);
  });

  test.each([
    'application:read:all',
    'application:vote:all',
    'application:stats:all',
    'team:read:all',
    'rsvp:read:all',
    'dietary:read:all',
    'article:read:all',
    'event:manage:all',
    'submission:read:all',
    'judging:manage:all',
    'judging:results:all',
    'judging:award:all',
  ])('%s alone is enough', (slug) => {
    expect(Rbac.canOpenEventDashboard([slug])).toBe(true);
  });

  test('wildcard grants count', () => {
    expect(Rbac.canOpenEventDashboard(['all:all:all'])).toBe(true);
    expect(Rbac.canOpenEventDashboard(['checkin:all:all'])).toBe(true);
  });

  test('permissions that gate nothing under an event do not', () => {
    expect(Rbac.canOpenEventDashboard([])).toBe(false);
    expect(
      Rbac.canOpenEventDashboard(['participant:read:all', 'user:read:all', 'role:read:all', 'team:manage:all']),
    ).toBe(false);
  });
});
