/**
 * RBAC tests for src/app/dashboard/admin/events/actions.ts
 *
 * Two scenarios per exported function:
 *  1. Unauthenticated (getUser → null) → fail('Not authenticated')
 *  2. Authenticated without event:manage → throws REDIRECT:/forbidden
 *
 * Happy-path and functional correctness are covered in admin-events.test.ts.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import { user, events } from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({ updateTag: vi.fn() }));

import { getUser } from '@/utils/auth';
import {
  getEventWithQuestions,
  addQuestion,
  editQuestion,
  removeQuestion,
  reorderQuestions,
  reactivateQuestion,
  createEvent,
  getEventDetails,
  updateEventSettings,
  getApplicationResponses,
} from '@/app/dashboard/admin/events/actions';

type MockUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

const FORBIDDEN =
  'REDIRECT:/forbidden?reason=missing_permission&permission=event:manage';

let noPermUserId: string;
let noPermUser: MockUser;
let testEventId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({
      name: 'No Perm Admin',
      email: 'admin-events-noperm@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  noPermUserId = u.id;
  noPermUser = {
    id: noPermUserId,
    email: 'admin-events-noperm@example.com',
    name: 'No Perm Admin',
    emailVerified: true,
  };

  const [e] = await db
    .insert(events)
    .values({
      name: 'Auth Test Event',
      hasApplication: true,
      applicationQuestions: [],
    })
    .returning({ id: events.id });
  testEventId = e.id;

  vi.mocked(getUser).mockResolvedValue(noPermUser as never);
});

afterAll(async () => {
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(user).where(eq(user.id, noPermUserId));
});

// ─── createEvent ───────────────────────────────────────────────────────────────

describe('createEvent', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(
      createEvent({ name: 'X', hasApplication: false }),
    ).resolves.toMatchObject({ success: false });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(
      createEvent({ name: 'X', hasApplication: false }),
    ).rejects.toThrow(FORBIDDEN);
  });
});

// ─── getEventWithQuestions ────────────────────────────────────────────────────

describe('getEventWithQuestions', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getEventWithQuestions(testEventId)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(getEventWithQuestions(testEventId)).rejects.toThrow(FORBIDDEN);
  });
});

// ─── getEventDetails ──────────────────────────────────────────────────────────

describe('getEventDetails', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getEventDetails(testEventId)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(getEventDetails(testEventId)).rejects.toThrow(FORBIDDEN);
  });
});

// ─── getApplicationResponses ──────────────────────────────────────────────────

describe('getApplicationResponses', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getApplicationResponses(testEventId)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(getApplicationResponses(testEventId)).rejects.toThrow(
      FORBIDDEN,
    );
  });
});

// ─── addQuestion ──────────────────────────────────────────────────────────────

describe('addQuestion', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(
      addQuestion(testEventId, {
        label: 'Q',
        type: 'short_text',
        required: false,
      }),
    ).resolves.toMatchObject({ success: false });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(
      addQuestion(testEventId, {
        label: 'Q',
        type: 'short_text',
        required: false,
      }),
    ).rejects.toThrow(FORBIDDEN);
  });
});

// ─── editQuestion ─────────────────────────────────────────────────────────────

describe('editQuestion', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(
      editQuestion(testEventId, '00000000-0000-0000-0000-000000000000', {
        label: 'Q',
      }),
    ).resolves.toMatchObject({ success: false });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(
      editQuestion(testEventId, '00000000-0000-0000-0000-000000000000', {
        label: 'Q',
      }),
    ).rejects.toThrow(FORBIDDEN);
  });
});

// ─── removeQuestion ───────────────────────────────────────────────────────────

describe('removeQuestion', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(
      removeQuestion(testEventId, '00000000-0000-0000-0000-000000000000'),
    ).resolves.toMatchObject({ success: false });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(
      removeQuestion(testEventId, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(FORBIDDEN);
  });
});

// ─── reorderQuestions ─────────────────────────────────────────────────────────

describe('reorderQuestions', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(reorderQuestions(testEventId, [])).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(reorderQuestions(testEventId, [])).rejects.toThrow(FORBIDDEN);
  });
});

// ─── reactivateQuestion ───────────────────────────────────────────────────────

describe('reactivateQuestion', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(
      reactivateQuestion(testEventId, '00000000-0000-0000-0000-000000000000'),
    ).resolves.toMatchObject({ success: false });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(
      reactivateQuestion(testEventId, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(FORBIDDEN);
  });
});

// ─── updateEventSettings ──────────────────────────────────────────────────────

describe('updateEventSettings', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(
      updateEventSettings(testEventId, { name: 'X' }),
    ).resolves.toMatchObject({ success: false });
  });

  test('redirects to /forbidden without event:manage', async () => {
    await expect(
      updateEventSettings(testEventId, { name: 'X' }),
    ).rejects.toThrow(FORBIDDEN);
  });
});
