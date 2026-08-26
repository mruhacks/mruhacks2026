import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import {
  user,
  events,
  eventApplications,
  permission,
  userPermission,
} from '@/db/schema';
import {
  createEvent,
  addQuestion,
  editQuestion,
  removeQuestion,
  reorderQuestions,
  reactivateQuestion,
  getEventWithQuestions,
  getEventDetails,
  updateEventSettings,
  getApplicationResponses,
} from '@/app/dashboard/admin/events/actions';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock('next/cache', () => ({ updateTag: vi.fn() }));

import { getUser } from '@/utils/auth';

let adminUserId: string;
let eventManagePermId: number;
let testEventId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({
      name: 'Event Admin',
      email: 'event-admin@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  adminUserId = u.id;

  const [p] = await db
    .insert(permission)
    .values({ slug: 'event:manage:all' })
    .onConflictDoNothing()
    .returning({ id: permission.id });
  if (p) {
    eventManagePermId = p.id;
  } else {
    const [existing] = await db
      .select({ id: permission.id })
      .from(permission)
      .where(eq(permission.slug, 'event:manage:all'))
      .limit(1);
    eventManagePermId = existing.id;
  }

  await db
    .insert(userPermission)
    .values({ userId: adminUserId, permissionId: eventManagePermId })
    .onConflictDoNothing();

  const [e] = await db
    .insert(events)
    .values({
      name: 'Test Event',
      hasApplication: true,
      applicationQuestions: [],
    })
    .returning({ id: events.id });
  testEventId = e.id;

  vi.mocked(getUser).mockResolvedValue({
    id: adminUserId,
    email: 'event-admin@example.com',
    name: 'Event Admin',
    emailVerified: true,
  } as never);
});

afterAll(async () => {
  await db
    .delete(eventApplications)
    .where(eq(eventApplications.eventId, testEventId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(userPermission).where(eq(userPermission.userId, adminUserId));
  await db.delete(user).where(eq(user.id, adminUserId));
});

describe('createEvent', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await createEvent({
      name: 'New Event',
      hasApplication: false,
    });
    expect(result.success).toBe(false);
  });

  test('returns validation error for empty event name', async () => {
    const result = await createEvent({ name: '', hasApplication: false });
    expect(result.success).toBe(false);
  });

  test('creates an event and returns its id', async () => {
    const result = await createEvent({
      name: 'Brand New Event',
      hasApplication: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.id).toBeTruthy();

    const [row] = await db
      .select({ applicationQuestions: events.applicationQuestions })
      .from(events)
      .where(eq(events.id, result.data!.id));
    expect(row.applicationQuestions).toEqual([]);

    await db.delete(events).where(eq(events.id, result.data!.id));
  });

  test('creates an application-required event without requiring custom questions', async () => {
    const result = await createEvent({
      name: 'App Event',
      hasApplication: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);

    const [row] = await db
      .select()
      .from(events)
      .where(eq(events.id, result.data!.id));
    expect(row.applicationQuestions).toEqual([]);
    await db.delete(events).where(eq(events.id, result.data!.id));
  });

  test('validates that startsAt is before endsAt', async () => {
    const result = await createEvent({
      name: 'Bad Dates Event',
      hasApplication: false,
      startsAt: '2026-12-31T12:00',
      endsAt: '2026-01-01T12:00',
    });
    expect(result.success).toBe(false);
  });
});
describe('getEventWithQuestions', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await getEventWithQuestions(testEventId);
    expect(result.success).toBe(false);
  });

  test('returns error for nonexistent event', async () => {
    const result = await getEventWithQuestions(
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('not found');
  });

  test('returns event with empty questions list', async () => {
    const result = await getEventWithQuestions(testEventId);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.name).toBe('Test Event');
    expect(result.data?.questions).toEqual([]);
    expect(result.data?.hasApplications).toBe(false);
  });
});

describe('getEventDetails', () => {
  test('returns error for nonexistent event', async () => {
    const result = await getEventDetails(
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('not found');
  });

  test('returns event details with zero stats', async () => {
    const result = await getEventDetails(testEventId);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.applicationsCount).toBe(0);
    expect(result.data?.questionsCount).toBe(0);
  });
});

describe('addQuestion', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await addQuestion(testEventId, {
      label: 'Q',
      type: 'short_text',
      required: false,
    });
    expect(result.success).toBe(false);
  });

  test('returns error for nonexistent event', async () => {
    const result = await addQuestion('00000000-0000-0000-0000-000000000000', {
      label: 'Q',
      type: 'short_text',
      required: false,
    });
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('not found');
  });

  test('returns validation error for empty label', async () => {
    const result = await addQuestion(testEventId, {
      label: '',
      type: 'short_text',
      required: false,
    });
    expect(result.success).toBe(false);
  });

  test('adds a short_text question and returns it', async () => {
    const result = await addQuestion(testEventId, {
      label: 'What is your name?',
      type: 'short_text',
      required: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.label).toBe('What is your name?');
    expect(result.data?.type).toBe('short_text');
    expect(result.data?.id).toBeTruthy();
    expect(result.data?.active).toBe(true);
  });

  test('adds single_select question with options that get UUIDs', async () => {
    const result = await addQuestion(testEventId, {
      label: 'T-Shirt Size',
      type: 'single_select',
      required: false,
      options: [{ label: 'Small' }, { label: 'Medium' }],
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.options).toHaveLength(2);
    expect(result.data?.options![0].value).toBeTruthy();
    expect(result.data?.options![0].label).toBe('Small');
  });

  test('new question order is one greater than existing max', async () => {
    const res1 = await getEventWithQuestions(testEventId);
    if (!res1.success) throw new Error('setup failed');
    const maxOrder = res1.data!.questions.reduce(
      (m, q) => Math.max(m, q.order),
      0,
    );

    const result = await addQuestion(testEventId, {
      label: 'Last Question',
      type: 'short_text',
      required: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.order).toBe(maxOrder + 1);
  });
});

describe('editQuestion', () => {
  let questionId: string;

  beforeAll(async () => {
    const result = await addQuestion(testEventId, {
      label: 'Original Label',
      type: 'short_text',
      required: false,
    });
    if (!result.success) throw new Error('setup failed');
    questionId = result.data!.id;
  });

  test('returns error for nonexistent event', async () => {
    const result = await editQuestion(
      '00000000-0000-0000-0000-000000000000',
      questionId,
      { label: 'New' },
    );
    expect(result.success).toBe(false);
  });

  test('returns error for nonexistent question ID', async () => {
    const result = await editQuestion(
      testEventId,
      '00000000-0000-0000-0000-000000000000',
      { label: 'New' },
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('not found');
  });

  test('updates question label', async () => {
    const result = await editQuestion(testEventId, questionId, {
      label: 'Updated Label',
    });
    expect(result.success).toBe(true);

    const evtResult = await getEventWithQuestions(testEventId);
    if (!evtResult.success) throw new Error('setup failed');
    const q = evtResult.data!.questions.find((q) => q.id === questionId);
    expect(q?.label).toBe('Updated Label');
  });

  test('updates required flag', async () => {
    const result = await editQuestion(testEventId, questionId, {
      required: true,
    });
    expect(result.success).toBe(true);

    const evtResult = await getEventWithQuestions(testEventId);
    if (!evtResult.success) throw new Error('setup failed');
    const q = evtResult.data!.questions.find((q) => q.id === questionId);
    expect(q?.required).toBe(true);
  });
});

describe('removeQuestion', () => {
  test('hard-deletes question when no applications exist', async () => {
    const added = await addQuestion(testEventId, {
      label: 'To Delete',
      type: 'short_text',
      required: false,
    });
    if (!added.success) throw new Error('setup failed');
    const qId = added.data!.id;

    const result = await removeQuestion(testEventId, qId);
    expect(result.success).toBe(true);
    expect((result as { data: unknown }).data).toContain('deleted');

    const evtResult = await getEventWithQuestions(testEventId);
    if (!evtResult.success) throw new Error();
    expect(evtResult.data!.questions.find((q) => q.id === qId)).toBeUndefined();
  });

  test('soft-deletes question (active=false) when applications exist', async () => {
    const added = await addQuestion(testEventId, {
      label: 'To Soft Delete',
      type: 'short_text',
      required: false,
    });
    if (!added.success) throw new Error('setup failed');
    const qId = added.data!.id;

    const [appUser] = await db
      .insert(user)
      .values({
        name: 'App User',
        email: 'app-user@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    await db
      .insert(eventApplications)
      .values({ eventId: testEventId, userId: appUser.id, responses: {} });

    const result = await removeQuestion(testEventId, qId);
    expect(result.success).toBe(true);
    expect((result as { data: unknown }).data).toContain('hidden');

    const evtResult = await getEventWithQuestions(testEventId);
    if (!evtResult.success) throw new Error();
    const q = evtResult.data!.questions.find((q) => q.id === qId);
    expect(q).toBeDefined();
    expect(q?.active).toBe(false);

    await db
      .delete(eventApplications)
      .where(eq(eventApplications.userId, appUser.id));
    await db.delete(user).where(eq(user.id, appUser.id));
  });

  test('returns error for nonexistent question', async () => {
    const result = await removeQuestion(
      testEventId,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('not found');
  });

  test('section_divider is always hard-deleted even when applications exist', async () => {
    const added = await addQuestion(testEventId, {
      label: 'Section',
      type: 'section_divider',
      required: false,
    });
    if (!added.success) throw new Error('setup failed');
    const qId = added.data!.id;

    const [appUser] = await db
      .insert(user)
      .values({
        name: 'App User 2',
        email: 'app-user2@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    await db
      .insert(eventApplications)
      .values({ eventId: testEventId, userId: appUser.id, responses: {} });

    const result = await removeQuestion(testEventId, qId);
    expect(result.success).toBe(true);
    expect((result as { data: unknown }).data).toContain('deleted');

    await db
      .delete(eventApplications)
      .where(eq(eventApplications.userId, appUser.id));
    await db.delete(user).where(eq(user.id, appUser.id));
  });
});

describe('reorderQuestions', () => {
  test('returns error when orderedIds do not match existing questions', async () => {
    const result = await reorderQuestions(testEventId, ['nonexistent-id']);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('orderedIds');
  });

  test('reorders questions correctly', async () => {
    const e = await db
      .insert(events)
      .values({
        name: 'Reorder Event',
        hasApplication: true,
        applicationQuestions: [],
      })
      .returning({ id: events.id });
    const eventId = e[0].id;

    const q1 = await addQuestion(eventId, {
      label: 'First',
      type: 'short_text',
      required: false,
    });
    const q2 = await addQuestion(eventId, {
      label: 'Second',
      type: 'short_text',
      required: false,
    });
    if (!q1.success || !q2.success) throw new Error('setup failed');

    const result = await reorderQuestions(eventId, [q2.data!.id, q1.data!.id]);
    expect(result.success).toBe(true);

    const evtResult = await getEventWithQuestions(eventId);
    if (!evtResult.success) throw new Error();
    const ordered = evtResult.data!.questions.sort((a, b) => a.order - b.order);
    expect(ordered[0].id).toBe(q2.data!.id);
    expect(ordered[1].id).toBe(q1.data!.id);

    await db.delete(events).where(eq(events.id, eventId));
  });
});

describe('reactivateQuestion', () => {
  test('sets question active=true', async () => {
    const added = await addQuestion(testEventId, {
      label: 'Reactivate Me',
      type: 'short_text',
      required: false,
    });
    if (!added.success) throw new Error('setup failed');
    const qId = added.data!.id;

    const [appUser] = await db
      .insert(user)
      .values({
        name: 'App User 3',
        email: 'app-user3@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    await db
      .insert(eventApplications)
      .values({ eventId: testEventId, userId: appUser.id, responses: {} });

    await removeQuestion(testEventId, qId);

    const result = await reactivateQuestion(testEventId, qId);
    expect(result.success).toBe(true);

    const evtResult = await getEventWithQuestions(testEventId);
    if (!evtResult.success) throw new Error();
    const q = evtResult.data!.questions.find((q) => q.id === qId);
    expect(q?.active).toBe(true);

    await db
      .delete(eventApplications)
      .where(eq(eventApplications.userId, appUser.id));
    await db.delete(user).where(eq(user.id, appUser.id));
  });

  test('returns error for nonexistent question', async () => {
    const result = await reactivateQuestion(
      testEventId,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result.success).toBe(false);
  });
});

describe('updateEventSettings', () => {
  test('returns error for nonexistent event', async () => {
    const result = await updateEventSettings(
      '00000000-0000-0000-0000-000000000000',
      { name: 'X' },
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('not found');
  });

  test('updates event name', async () => {
    const result = await updateEventSettings(testEventId, {
      name: 'Renamed Event',
    });
    expect(result.success).toBe(true);

    const [row] = await db
      .select({ name: events.name })
      .from(events)
      .where(eq(events.id, testEventId));
    expect(row.name).toBe('Renamed Event');
  });

  test('returns validation error when startsAt is after endsAt', async () => {
    const result = await updateEventSettings(testEventId, {
      startsAt: '2026-12-31T12:00',
      endsAt: '2026-01-01T12:00',
    });
    expect(result.success).toBe(false);
  });
});

describe('getApplicationResponses', () => {
  test('returns empty array when no applications', async () => {
    const e = await db
      .insert(events)
      .values({
        name: 'Empty Responses Event',
        hasApplication: true,
        applicationQuestions: [],
      })
      .returning({ id: events.id });
    const eventId = e[0].id;

    const result = await getApplicationResponses(eventId);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data).toEqual([]);

    await db.delete(events).where(eq(events.id, eventId));
  });
});
