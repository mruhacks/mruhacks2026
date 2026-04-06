/**
 * Integration tests for the form builder server actions.
 * Tests CRUD operations and invariant enforcement against a real database.
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { events, eventApplications, user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ApplicationQuestion } from '@/types/application';

import {
  getFormBuilderData,
  addQuestion,
  editQuestion,
  removeQuestion,
  reorderQuestions,
} from '@/app/dashboard/events/[eventId]/form-builder/actions';

// ---------------------------------------------------------------------------
// Mock auth — pretend we're always logged in as test user
// ---------------------------------------------------------------------------

let testUserId: string;

vi.mock('@/utils/auth', () => ({
  getUser: vi.fn(async () => ({
    id: testUserId,
    name: 'Test User',
    email: 'formbuilder@test.com',
  })),
  getSession: vi.fn(async () => ({
    user: {
      id: testUserId,
      name: 'Test User',
      email: 'formbuilder@test.com',
    },
  })),
}));

// Mock hasPermission to always allow — we're testing form builder logic, not authz
vi.mock('@/app/actions/authz', () => ({
  hasPermission: vi.fn(async () => true),
  requirePermission: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

let testEventId: string;

beforeAll(async () => {
  // Create test user
  const [u] = await db
    .insert(user)
    .values({
      name: 'Form Builder Test User',
      email: 'formbuilder@test.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = u.id;

  // Create test event
  const [e] = await db
    .insert(events)
    .values({
      name: 'Form Builder Test Event',
      hasApplication: true,
      applicationQuestions: [],
    })
    .returning({ id: events.id });
  testEventId = e.id;
});

afterAll(async () => {
  // Clean up in reverse dependency order
  await db
    .delete(eventApplications)
    .where(eq(eventApplications.eventId, testEventId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(user).where(eq(user.id, testUserId));
});

// ---------------------------------------------------------------------------
// getFormBuilderData
// ---------------------------------------------------------------------------

describe('getFormBuilderData', () => {
  test('returns event data and empty questions for a new event', async () => {
    const result = await getFormBuilderData(testEventId);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data!.event.id).toBe(testEventId);
    expect(result.data!.event.name).toBe('Form Builder Test Event');
    expect(result.data!.questions).toEqual([]);
    expect(result.data!.hasApplications).toBe(false);
  });

  test('returns error for non-existent event', async () => {
    const result = await getFormBuilderData(
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addQuestion
// ---------------------------------------------------------------------------

describe('addQuestion', () => {
  test('adds a short_text question', async () => {
    const result = await addQuestion(testEventId, {
      id: crypto.randomUUID(),
      label: 'Why do you want to attend?',
      description: 'Tell us your motivation',
      type: 'short_text',
      required: true,
      options: undefined,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const questions = result.data!;
    expect(questions).toHaveLength(1);
    expect(questions[0].label).toBe('Why do you want to attend?');
    expect(questions[0].description).toBe('Tell us your motivation');
    expect(questions[0].type).toBe('short_text');
    expect(questions[0].required).toBe(true);
    expect(questions[0].active).toBe(true);
    expect(questions[0].order).toBe(1);
  });

  test('adds a single_select question with options', async () => {
    const result = await addQuestion(testEventId, {
      id: crypto.randomUUID(),
      label: 'Experience level',
      type: 'single_select',
      required: false,
      options: [
        { value: 'beginner', label: 'Beginner' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'advanced', label: 'Advanced' },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const questions = result.data!;
    expect(questions).toHaveLength(2);

    const selectQ = questions.find((q) => q.type === 'single_select');
    expect(selectQ).toBeDefined();
    expect(selectQ!.options).toHaveLength(3);
    expect(selectQ!.order).toBe(2);
  });

  test('adds a boolean question', async () => {
    const result = await addQuestion(testEventId, {
      id: crypto.randomUUID(),
      label: 'Agree to code of conduct?',
      type: 'boolean',
      required: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data!).toHaveLength(3);
    const boolQ = result.data!.find((q) => q.type === 'boolean');
    expect(boolQ).toBeDefined();
    expect(boolQ!.order).toBe(3);
  });

  test('rejects question with empty label', async () => {
    const result = await addQuestion(testEventId, {
      id: crypto.randomUUID(),
      label: '   ',
      type: 'short_text',
      required: false,
    });

    expect(result.success).toBe(false);
  });

  test('rejects question with no type', async () => {
    const result = await addQuestion(testEventId, {
      id: crypto.randomUUID(),
      label: 'Test',
      type: '' as 'short_text',
      required: false,
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// editQuestion
// ---------------------------------------------------------------------------

describe('editQuestion', () => {
  let questionId: string;

  beforeAll(async () => {
    // Get the first question
    const result = await getFormBuilderData(testEventId);
    if (result.success) {
      questionId = result.data!.questions[0].id;
    }
  });

  test('edits label and description', async () => {
    const result = await editQuestion(testEventId, questionId, {
      label: 'Updated question label',
      description: 'Updated description',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const updated = result.data!.find((q) => q.id === questionId);
    expect(updated!.label).toBe('Updated question label');
    expect(updated!.description).toBe('Updated description');
  });

  test('edits required status', async () => {
    const result = await editQuestion(testEventId, questionId, {
      required: false,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const updated = result.data!.find((q) => q.id === questionId);
    expect(updated!.required).toBe(false);
  });

  test('changes type when no responses exist', async () => {
    const result = await editQuestion(testEventId, questionId, {
      type: 'long_text',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const updated = result.data!.find((q) => q.id === questionId);
    expect(updated!.type).toBe('long_text');
  });

  test('returns error for non-existent question', async () => {
    const result = await editQuestion(
      testEventId,
      '00000000-0000-0000-0000-000000000000',
      { label: 'nope' },
    );

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reorderQuestions
// ---------------------------------------------------------------------------

describe('reorderQuestions', () => {
  test('reorders active questions', async () => {
    const data = await getFormBuilderData(testEventId);
    if (!data.success) throw new Error('Setup failed');

    const questions = data.data!.questions;
    const reversed = [...questions].reverse().map((q) => q.id);

    const result = await reorderQuestions(testEventId, reversed);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Verify order matches reversed IDs
    const active = result
      .data!.filter((q) => q.active)
      .sort((a, b) => a.order - b.order);
    expect(active.map((q) => q.id)).toEqual(reversed);
  });

  test('preserves questions not in orderedIds', async () => {
    const data = await getFormBuilderData(testEventId);
    if (!data.success) throw new Error('Setup failed');

    const questions = data.data!.questions;
    // Only pass first question; others should be appended
    const result = await reorderQuestions(testEventId, [questions[0].id]);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data!).toHaveLength(questions.length);
  });
});

// ---------------------------------------------------------------------------
// removeQuestion (no applications)
// ---------------------------------------------------------------------------

describe('removeQuestion (no applications)', () => {
  test('hard-deletes a question when no applications exist', async () => {
    // Add a throwaway question
    const addResult = await addQuestion(testEventId, {
      id: crypto.randomUUID(),
      label: 'Throwaway question',
      type: 'short_text',
      required: false,
    });
    expect(addResult.success).toBe(true);
    if (!addResult.success) return;

    const countBefore = addResult.data!.length;
    const throwawayId = addResult.data![addResult.data!.length - 1].id;

    const result = await removeQuestion(testEventId, throwawayId);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data!).toHaveLength(countBefore - 1);
    expect(result.data!.find((q) => q.id === throwawayId)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Invariant enforcement (with applications)
// ---------------------------------------------------------------------------

describe('invariant enforcement with existing applications', () => {
  let questionWithResponseId: string;
  let questionWithoutResponseId: string;
  let selectQuestionId: string;

  beforeAll(async () => {
    // Get current questions state
    const data = await getFormBuilderData(testEventId);
    if (!data.success) throw new Error('Setup failed');

    const questions = data.data!.questions;
    questionWithResponseId = questions[0].id;

    // Find or create a select question for option tests
    let selectQ = questions.find((q) => q.type === 'single_select');
    if (!selectQ) {
      const addResult = await addQuestion(testEventId, {
        id: crypto.randomUUID(),
        label: 'Select for test',
        type: 'single_select',
        required: false,
        options: [
          { value: 'opt-a', label: 'Option A' },
          { value: 'opt-b', label: 'Option B' },
        ],
      });
      if (addResult.success) {
        selectQ = addResult.data!.find((q) => q.type === 'single_select');
      }
    }
    selectQuestionId = selectQ!.id;

    // Add a question that will NOT have responses
    const noRespResult = await addQuestion(testEventId, {
      id: crypto.randomUUID(),
      label: 'No responses here',
      type: 'short_text',
      required: false,
    });
    if (noRespResult.success) {
      questionWithoutResponseId =
        noRespResult.data![noRespResult.data!.length - 1].id;
    }

    // Create an application with responses referencing the first question and select question
    await db.insert(eventApplications).values({
      eventId: testEventId,
      userId: testUserId,
      responses: {
        [questionWithResponseId]: 'My answer',
        [selectQuestionId]: 'opt-a',
      },
    });
  });

  test('blocks type change on question with responses', async () => {
    const result = await editQuestion(testEventId, questionWithResponseId, {
      type: 'number',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Cannot change question type');
    }
  });

  test('allows label change on question with responses', async () => {
    const result = await editQuestion(testEventId, questionWithResponseId, {
      label: 'Updated label with responses',
    });

    expect(result.success).toBe(true);
  });

  test('allows required status change on question with responses', async () => {
    const result = await editQuestion(testEventId, questionWithResponseId, {
      required: true,
    });

    expect(result.success).toBe(true);
  });

  test('blocks removal of options that have responses', async () => {
    // Try to set options to only opt-b (removing opt-a which has responses)
    const result = await editQuestion(testEventId, selectQuestionId, {
      options: [{ value: 'opt-b', label: 'Option B' }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Cannot remove option');
    }
  });

  test('allows adding new options when responses exist', async () => {
    const result = await editQuestion(testEventId, selectQuestionId, {
      options: [
        { value: 'opt-a', label: 'Option A' },
        { value: 'opt-b', label: 'Option B' },
        { value: 'opt-c', label: 'Option C' },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const updated = result.data!.find((q) => q.id === selectQuestionId);
    expect(updated!.options).toHaveLength(3);
  });

  test('soft-deletes question with responses (sets active=false)', async () => {
    const result = await removeQuestion(testEventId, questionWithResponseId);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const deactivated = result.data!.find(
      (q) => q.id === questionWithResponseId,
    );
    expect(deactivated).toBeDefined();
    expect(deactivated!.active).toBe(false);
  });

  test('hard-deletes question WITHOUT responses even when applications exist', async () => {
    const beforeData = await getFormBuilderData(testEventId);
    if (!beforeData.success) throw new Error('Setup failed');
    const countBefore = beforeData.data!.questions.length;

    const result = await removeQuestion(testEventId, questionWithoutResponseId);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data!).toHaveLength(countBefore - 1);
    expect(
      result.data!.find((q) => q.id === questionWithoutResponseId),
    ).toBeUndefined();
  });

  test('getFormBuilderData reports hasApplications=true', async () => {
    const result = await getFormBuilderData(testEventId);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data!.hasApplications).toBe(true);
  });
});
