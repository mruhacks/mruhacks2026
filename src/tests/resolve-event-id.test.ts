import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import { events } from '@/db/schema';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import { resolveEventId } from '@/lib/events';

let sluggedEventId: string;
let plainEventId: string;

beforeAll(async () => {
  const [slugged] = await db
    .insert(events)
    .values({
      name: 'Slug Resolution Event',
      hasApplication: false,
      applicationQuestions: [],
      slug: 'resolution-2026',
    })
    .returning({ id: events.id });
  sluggedEventId = slugged.id;

  const [plain] = await db
    .insert(events)
    .values({
      name: 'Uuid Only Event',
      hasApplication: false,
      applicationQuestions: [],
    })
    .returning({ id: events.id });
  plainEventId = plain.id;
});

afterAll(async () => {
  await db.delete(events).where(eq(events.id, sluggedEventId));
  await db.delete(events).where(eq(events.id, plainEventId));
});

describe('resolveEventId', () => {
  test('resolves a custom slug to the event uuid', async () => {
    await expect(resolveEventId('resolution-2026')).resolves.toBe(
      sluggedEventId,
    );
  });

  test('passes a uuid segment straight through', async () => {
    await expect(resolveEventId(plainEventId)).resolves.toBe(plainEventId);
  });

  test('returns the uuid unchecked, leaving 404s to the caller query', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    await expect(resolveEventId(missing)).resolves.toBe(missing);
  });

  test('returns null for a slug no event owns', async () => {
    await expect(resolveEventId('no-such-event')).resolves.toBeNull();
  });
});
