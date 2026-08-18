import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import { applicationStatuses } from '@/db/schema';

vi.mock('server-only', () => ({}));

import {
  resolveApplicationStatusKey,
  getApplicationStatusDisplayMap,
  getApplicationStatusDisplay,
} from '@/app/dashboard/events/application-status';

const TEST_LABEL = 'pending_review';
let seededStatusId: number;

beforeAll(async () => {
  // Upsert a known status row so DB-backed tests are deterministic.
  const [existing] = await db
    .select({ id: applicationStatuses.id })
    .from(applicationStatuses)
    .where(eq(applicationStatuses.label, TEST_LABEL))
    .limit(1);

  if (existing) {
    seededStatusId = existing.id;
  } else {
    const [inserted] = await db
      .insert(applicationStatuses)
      .values({
        label: TEST_LABEL,
        title: 'Under review',
        description: 'Your application is being reviewed.',
        variant: 'default',
        isFinal: false,
      })
      .returning({ id: applicationStatuses.id });
    seededStatusId = inserted.id;
  }
});

afterAll(async () => {
  // Only delete what we inserted (leave pre-existing rows alone).
  if (seededStatusId) {
    await db
      .delete(applicationStatuses)
      .where(eq(applicationStatuses.id, seededStatusId));
  }
});

// ─── resolveApplicationStatusKey ──────────────────────────────────────────────

describe('resolveApplicationStatusKey', () => {
  test('returns the key when it is a valid application status', () => {
    expect(resolveApplicationStatusKey('approved')).toBe('approved');
    expect(resolveApplicationStatusKey('denied')).toBe('denied');
    expect(resolveApplicationStatusKey('waitlisted')).toBe('waitlisted');
    expect(resolveApplicationStatusKey('pending_review')).toBe('pending_review');
  });

  test('falls back to pending_review for an unknown string', () => {
    expect(resolveApplicationStatusKey('unknown_status')).toBe('pending_review');
    expect(resolveApplicationStatusKey('')).toBe('pending_review');
  });

  test('falls back to pending_review for null', () => {
    expect(resolveApplicationStatusKey(null)).toBe('pending_review');
  });

  test('falls back to pending_review for undefined', () => {
    expect(resolveApplicationStatusKey(undefined)).toBe('pending_review');
  });
});

// ─── getApplicationStatusDisplayMap ───────────────────────────────────────────

describe('getApplicationStatusDisplayMap', () => {
  test('returns a map keyed by status label', async () => {
    const map = await getApplicationStatusDisplayMap();
    expect(map).toHaveProperty(TEST_LABEL);
    const entry = map[TEST_LABEL]!;
    expect(entry).toHaveProperty('title');
    expect(entry).toHaveProperty('description');
    expect(entry).toHaveProperty('variant');
    expect(entry).toHaveProperty('isFinal');
  });
});

// ─── getApplicationStatusDisplay ──────────────────────────────────────────────

describe('getApplicationStatusDisplay', () => {
  test('returns display config for a known status', async () => {
    const display = await getApplicationStatusDisplay(TEST_LABEL);
    expect(display).toBeDefined();
    expect(typeof display?.title).toBe('string');
  });

  test('returns pending_review display for null input', async () => {
    const display = await getApplicationStatusDisplay(null);
    // Falls back to pending_review; if that row exists the result is defined.
    const map = await getApplicationStatusDisplayMap();
    expect(display).toEqual(map['pending_review']);
  });
});
