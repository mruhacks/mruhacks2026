/**
 * Tests for src/app/dashboard/admin/events/content-actions.ts
 *
 * Covers both halves of the authorization split — the description rides on
 * `event:manage`, the wiki on `article:read:all` / `article:write:all` — plus
 * the slug and publish behaviour a participant-facing URL depends on.
 *
 * Object storage is mocked: these tests are about the actions' logic, and a
 * real bucket round-trip belongs in the storage layer's own coverage.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import {
  events,
  eventTerms,
  eventArticles,
  permission,
  user,
  userPermission,
} from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

const putObject =
  vi.fn<(args: { key: string; contentType: string }) => Promise<void>>();
const deleteObject = vi.fn<(key: string) => Promise<void>>();
vi.mock('@/utils/object-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/object-storage')>()),
  putObject: (args: { key: string; contentType: string }) => putObject(args),
  deleteObject: (key: string) => deleteObject(key),
}));

import { getUser } from '@/utils/auth';
import { revalidatePath, updateTag } from 'next/cache';
import { getPublishedArticleList } from '@/lib/event-wiki';
import {
  canWriteArticles,
  createEventArticle,
  deleteEventArticle,
  getEventArticle,
  listEventArticles,
  reorderEventArticles,
  updateEventArticle,
  updateEventDescription,
  updateEventTerms,
  uploadArticleAttachment,
  uploadEventDescriptionAttachment,
} from '@/app/dashboard/admin/events/content-actions';
import { isEventAttachmentKey } from '@/utils/object-storage';
import { unwrap } from './unwrap';

type MockUser = { id: string; email: string; name: string };

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const forbidden = (slug: string) =>
  `REDIRECT:/forbidden?reason=missing_permission&permission=${slug}`;

/** Grants a permission slug to a user, creating the permission if needed. */
async function grant(userId: string, slug: string) {
  const [inserted] = await db
    .insert(permission)
    .values({ slug })
    .onConflictDoNothing()
    .returning({ id: permission.id });
  const permissionId =
    inserted?.id ??
    (
      await db
        .select({ id: permission.id })
        .from(permission)
        .where(eq(permission.slug, slug))
        .limit(1)
    )[0].id;
  await db
    .insert(userPermission)
    .values({ userId, permissionId })
    .onConflictDoNothing();
}

async function makeUser(email: string): Promise<MockUser> {
  const [row] = await db
    .insert(user)
    .values({ name: email, email, emailVerified: true })
    .returning({ id: user.id });
  return { id: row.id, email, name: email };
}

let editor: MockUser;
let reader: MockUser;
let outsider: MockUser;
let eventId: string;

function actAs(mockUser: MockUser | null) {
  vi.mocked(getUser).mockResolvedValue(mockUser as never);
}

beforeAll(async () => {
  editor = await makeUser('wiki-editor@example.com');
  reader = await makeUser('wiki-reader@example.com');
  outsider = await makeUser('wiki-outsider@example.com');

  await grant(editor.id, 'event:manage:all');
  await grant(editor.id, 'article:read:all');
  await grant(editor.id, 'article:write:all');
  await grant(reader.id, 'article:read:all');

  const [row] = await db
    .insert(events)
    .values({ name: 'Wiki Test Event', applicationQuestions: [] })
    .returning({ id: events.id });
  eventId = row.id;

  actAs(editor);
});

afterAll(async () => {
  await db.delete(eventArticles).where(eq(eventArticles.eventId, eventId));
  await db.delete(events).where(eq(events.id, eventId));
  for (const u of [editor, reader, outsider]) {
    await db.delete(user).where(eq(user.id, u.id));
  }
});

// ─── Authorization ────────────────────────────────────────────────────────

describe('authorization', () => {
  test('every action fails when unauthenticated', async () => {
    actAs(null);
    await expect(updateEventDescription(eventId, 'hi')).resolves.toMatchObject({
      success: false,
    });
    await expect(
      uploadEventDescriptionAttachment(eventId, new FormData()),
    ).resolves.toMatchObject({ success: false });
    await expect(listEventArticles(eventId)).resolves.toMatchObject({
      success: false,
    });
    await expect(getEventArticle(eventId, NIL_UUID)).resolves.toMatchObject({
      success: false,
    });
    await expect(
      createEventArticle(eventId, { title: 'X' }),
    ).resolves.toMatchObject({ success: false });
    await expect(
      updateEventArticle(eventId, NIL_UUID, { published: true }),
    ).resolves.toMatchObject({ success: false });
    await expect(deleteEventArticle(eventId, NIL_UUID)).resolves.toMatchObject({
      success: false,
    });
    await expect(
      uploadArticleAttachment(eventId, new FormData()),
    ).resolves.toMatchObject({ success: false });
    await expect(canWriteArticles()).resolves.toBe(false);
    await expect(
      reorderEventArticles(eventId, [NIL_UUID]),
    ).resolves.toMatchObject({
      success: false,
    });
    actAs(editor);
  });

  test('description actions require event:manage', async () => {
    actAs(outsider);
    await expect(updateEventDescription(eventId, 'hi')).rejects.toThrow(
      forbidden('event:manage'),
    );
    await expect(
      uploadEventDescriptionAttachment(eventId, new FormData()),
    ).rejects.toThrow(forbidden('event:manage'));
    actAs(editor);
  });

  test('reading the wiki requires article:read:all', async () => {
    actAs(outsider);
    await expect(listEventArticles(eventId)).rejects.toThrow(
      forbidden('article:read:all'),
    );
    await expect(getEventArticle(eventId, NIL_UUID)).rejects.toThrow(
      forbidden('article:read:all'),
    );
    actAs(editor);
  });

  test('article:read:all alone cannot write', async () => {
    actAs(reader);
    await expect(reorderEventArticles(eventId, [NIL_UUID])).rejects.toThrow(
      forbidden('article:write:all'),
    );
    await expect(canWriteArticles()).resolves.toBe(false);
    await expect(createEventArticle(eventId, { title: 'X' })).rejects.toThrow(
      forbidden('article:write:all'),
    );
    await expect(
      updateEventArticle(eventId, NIL_UUID, { published: true }),
    ).rejects.toThrow(forbidden('article:write:all'));
    await expect(deleteEventArticle(eventId, NIL_UUID)).rejects.toThrow(
      forbidden('article:write:all'),
    );
    await expect(
      uploadArticleAttachment(eventId, new FormData()),
    ).rejects.toThrow(forbidden('article:write:all'));
    actAs(editor);
  });

  test('event:manage does not by itself grant article writes', async () => {
    const eventOnly = await makeUser('event-manager-only@example.com');
    await grant(eventOnly.id, 'event:manage:all');
    actAs(eventOnly);

    await expect(canWriteArticles()).resolves.toBe(false);
    await expect(createEventArticle(eventId, { title: 'X' })).rejects.toThrow(
      forbidden('article:write:all'),
    );

    actAs(editor);
    await db.delete(user).where(eq(user.id, eventOnly.id));
  });
});

// ─── Event description ────────────────────────────────────────────────────

describe('updateEventDescription', () => {
  test('stores markdown and reports the event when it is missing', async () => {
    const result = await updateEventDescription(eventId, '# Hello\n\nWorld');
    expect(result.success).toBe(true);

    const [row] = await db
      .select({ descriptionMarkdown: events.descriptionMarkdown })
      .from(events)
      .where(eq(events.id, eventId));
    expect(row.descriptionMarkdown).toBe('# Hello\n\nWorld');

    await expect(updateEventDescription(NIL_UUID, 'x')).resolves.toMatchObject({
      success: false,
    });
  });

  test('clears to NULL rather than storing whitespace', async () => {
    await updateEventDescription(eventId, '   \n  ');
    const [row] = await db
      .select({ descriptionMarkdown: events.descriptionMarkdown })
      .from(events)
      .where(eq(events.id, eventId));
    expect(row.descriptionMarkdown).toBe(null);
  });

  test('rejects markdown past the length cap', async () => {
    await expect(
      updateEventDescription(eventId, 'a'.repeat(20_001)),
    ).resolves.toMatchObject({ success: false });
  });
});

// ─── Wiki articles ────────────────────────────────────────────────────────

describe('wiki articles', () => {
  test('derives a slug from the title and starts unpublished', async () => {
    const created = await createEventArticle(eventId, {
      title: 'Getting Started',
    });
    expect(created).toMatchObject({
      success: true,
      data: { slug: 'getting-started' },
    });

    const detail = await getEventArticle(eventId, unwrap(created).id);
    expect(unwrap(detail)).toMatchObject({
      title: 'Getting Started',
      slug: 'getting-started',
      published: false,
      bodyMarkdown: '',
    });
  });

  test('disambiguates a derived slug that collides', async () => {
    const again = await createEventArticle(eventId, {
      title: 'Getting  started!',
    });
    expect(unwrap(again).slug).toBe('getting-started-2');
  });

  test('rejects an explicit slug that is already taken', async () => {
    await expect(
      createEventArticle(eventId, {
        title: 'Something else',
        slug: 'getting-started',
      }),
    ).resolves.toMatchObject({ success: false });
  });

  test('rejects a slug that is not URL-safe', async () => {
    await expect(
      createEventArticle(eventId, { title: 'Bad', slug: 'Not A Slug' }),
    ).resolves.toMatchObject({ success: false });
  });

  test('asks for a slug when the title has nothing sluggable', async () => {
    await expect(
      createEventArticle(eventId, { title: '！？…' }),
    ).resolves.toMatchObject({ success: false });
  });

  test('saves the body and publishes without restating other fields', async () => {
    const created = await createEventArticle(eventId, { title: 'Schedule' });
    const id = unwrap(created).id;

    expect(
      await updateEventArticle(eventId, id, { bodyMarkdown: '## Day 1' }),
    ).toMatchObject({ success: true });
    expect(
      await updateEventArticle(eventId, id, { published: true }),
    ).toMatchObject({ success: true });

    const detail = await getEventArticle(eventId, id);
    expect(unwrap(detail)).toMatchObject({
      title: 'Schedule',
      bodyMarkdown: '## Day 1',
      published: true,
    });
  });

  test('refuses to rename onto another article’s slug', async () => {
    const created = await createEventArticle(eventId, { title: 'Venue' });
    await expect(
      updateEventArticle(eventId, unwrap(created).id, {
        slug: 'getting-started',
      }),
    ).resolves.toMatchObject({ success: false });
  });

  test('scopes lookups to the event, so a foreign id is "not found"', async () => {
    const [other] = await db
      .insert(events)
      .values({ name: 'Other Event', applicationQuestions: [] })
      .returning({ id: events.id });
    const created = await createEventArticle(other.id, { title: 'Elsewhere' });

    await expect(
      getEventArticle(eventId, unwrap(created).id),
    ).resolves.toMatchObject({ success: false });
    await expect(
      updateEventArticle(eventId, unwrap(created).id, { title: 'Hijack' }),
    ).resolves.toMatchObject({ success: false });
    await expect(
      deleteEventArticle(eventId, unwrap(created).id),
    ).resolves.toMatchObject({ success: false });

    await db.delete(eventArticles).where(eq(eventArticles.eventId, other.id));
    await db.delete(events).where(eq(events.id, other.id));
  });

  test('lists drafts alongside published articles', async () => {
    const list = await listEventArticles(eventId);
    expect(list.success).toBe(true);
    const slugs = unwrap(list).map((a) => a.slug);
    expect(slugs).toContain('getting-started');
    expect(slugs).toContain('schedule');
    expect(unwrap(list).some((a) => !a.published)).toBe(true);
  });

  test('persists a complete order including drafts and refreshes both wiki views', async () => {
    const before = unwrap(await listEventArticles(eventId));
    const orderedIds = before.map((article) => article.id).reverse();
    vi.mocked(updateTag).mockClear();
    vi.mocked(revalidatePath).mockClear();

    expect(await reorderEventArticles(eventId, orderedIds)).toMatchObject({
      success: true,
    });
    const after = unwrap(await listEventArticles(eventId));
    expect(after.map((article) => article.id)).toEqual(orderedIds);
    expect(after.map((article) => article.sortOrder)).toEqual(
      orderedIds.map((_, index) => index),
    );
    expect(
      after.filter((article) => article.published).map((article) => article.id),
    ).toEqual(
      [...before]
        .reverse()
        .filter((article) => article.published)
        .map((article) => article.id),
    );
    expect(updateTag).toHaveBeenCalledWith(`event-wiki:${eventId}`);
    expect(
      (await getPublishedArticleList(eventId)).map((article) => article.slug),
    ).toEqual(
      after
        .filter((article) => article.published)
        .map((article) => article.slug),
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      `/dashboard/admin/events/${eventId}`,
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      `/dashboard/events/${eventId}/wiki`,
    );

    const created = unwrap(
      await createEventArticle(eventId, { title: 'A new last article' }),
    );
    expect(
      unwrap(await listEventArticles(eventId)).map((article) => article.id),
    ).toEqual([...orderedIds, created.id]);
  });

  test('reorders seeded article IDs alongside generated UUIDs', async () => {
    // These IDs match scripts/seed.ts: PostgreSQL accepts them even though
    // their version/variant bits do not satisfy strict RFC UUID validation.
    const seededIds = [
      '33333333-0000-0000-0000-000000000001',
      '33333333-0000-0000-0000-000000000002',
      '33333333-0000-0000-0000-000000000003',
    ];
    await db.insert(eventArticles).values(
      seededIds.map((id, index) => ({
        id,
        eventId,
        slug: `seeded-article-${index}`,
        title: `Seeded article ${index}`,
      })),
    );
    const ids = unwrap(await listEventArticles(eventId))
      .map((article) => article.id)
      .reverse();

    expect(await reorderEventArticles(eventId, ids)).toMatchObject({
      success: true,
    });
    expect(
      unwrap(await listEventArticles(eventId)).map((article) => article.id),
    ).toEqual(ids);
  });

  test('rejects duplicate, incomplete, foreign and malformed orders without changing articles', async () => {
    const before = unwrap(await listEventArticles(eventId));
    const ids = before.map((article) => article.id);
    const [other] = await db
      .insert(events)
      .values({ name: 'Foreign wiki' })
      .returning({ id: events.id });
    try {
      const foreign = unwrap(
        await createEventArticle(other.id, { title: 'Foreign article' }),
      );
      for (const invalid of [
        [],
        ids.slice(1),
        [ids[0], ...ids.slice(0, -1)],
        [foreign.id, ...ids.slice(1)],
        ['not-a-uuid', ...ids.slice(1)],
      ]) {
        expect(await reorderEventArticles(eventId, invalid)).toMatchObject({
          success: false,
        });
        expect(unwrap(await listEventArticles(eventId))).toEqual(before);
      }
      expect(
        unwrap(await getEventArticle(other.id, foreign.id)).sortOrder,
      ).toBe(0);
    } finally {
      await db.delete(events).where(eq(events.id, other.id));
    }
  });

  test('deletes the article row', async () => {
    const created = await createEventArticle(eventId, { title: 'Temporary' });
    const id = unwrap(created).id;

    expect(await deleteEventArticle(eventId, id)).toMatchObject({
      success: true,
    });
    const [row] = await db
      .select({ id: eventArticles.id })
      .from(eventArticles)
      .where(and(eq(eventArticles.id, id), eq(eventArticles.eventId, eventId)));
    expect(row).toBeUndefined();
  });
});

// ─── Attachments ──────────────────────────────────────────────────────────

describe('attachments', () => {
  function imageFormData(type: string, bytes = 32) {
    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array(bytes)], 'shot.png', { type }),
    );
    return formData;
  }

  test('stores an allowed image under a key the asset route will serve', async () => {
    putObject.mockClear();
    const result = await uploadArticleAttachment(
      eventId,
      imageFormData('image/png'),
    );
    expect(result.success).toBe(true);

    const key = (putObject.mock.calls[0][0] as { key: string }).key;
    expect(key.startsWith(`event-content/${eventId}/`)).toBe(true);
    expect(isEventAttachmentKey(key)).toBe(true);
    expect(unwrap(result).url).toBe(`/api/assets/${key}`);
  });

  test('rejects file types the asset route would hand back unexecuted', async () => {
    putObject.mockClear();
    await expect(
      uploadArticleAttachment(eventId, imageFormData('image/svg+xml')),
    ).resolves.toMatchObject({ success: false });
    await expect(
      uploadArticleAttachment(eventId, imageFormData('text/html')),
    ).resolves.toMatchObject({ success: false });
    expect(putObject).not.toHaveBeenCalled();
  });

  test('rejects an oversized image', async () => {
    putObject.mockClear();
    await expect(
      uploadArticleAttachment(
        eventId,
        imageFormData('image/png', 5 * 1024 * 1024 + 1),
      ),
    ).resolves.toMatchObject({ success: false });
    expect(putObject).not.toHaveBeenCalled();
  });

  test('rejects an upload for an event that does not exist', async () => {
    await expect(
      uploadArticleAttachment(NIL_UUID, imageFormData('image/png')),
    ).resolves.toMatchObject({ success: false });
  });

  test('deletes only the attachments nothing else still references', async () => {
    const shared = await uploadArticleAttachment(
      eventId,
      imageFormData('image/png'),
    );
    const lonely = await uploadArticleAttachment(
      eventId,
      imageFormData('image/png'),
    );
    const sharedUrl = unwrap(shared).url;
    const lonelyUrl = unwrap(lonely).url;

    const keeper = await createEventArticle(eventId, { title: 'Keeper' });
    await updateEventArticle(eventId, unwrap(keeper).id, {
      bodyMarkdown: `![shared](${sharedUrl})`,
    });

    const doomed = await createEventArticle(eventId, { title: 'Doomed' });
    await updateEventArticle(eventId, unwrap(doomed).id, {
      bodyMarkdown: `![shared](${sharedUrl})\n\n![lonely](${lonelyUrl})`,
    });

    deleteObject.mockClear();
    await deleteEventArticle(eventId, unwrap(doomed).id);

    const deleted = deleteObject.mock.calls.map((call) => call[0]);
    expect(deleted).toEqual([lonelyUrl.replace('/api/assets/', '')]);
  });
});

describe('Event Terms copy-on-write', () => {
  test('requires event:manage, including when clearing terms', async () => {
    actAs(null);
    expect((await updateEventTerms(eventId, 'Rules')).success).toBe(false);
    actAs(outsider);
    await expect(updateEventTerms(eventId, '')).rejects.toThrow(
      forbidden('event:manage'),
    );
    actAs(reader);
    await expect(updateEventTerms(eventId, 'Rules')).rejects.toThrow(
      forbidden('event:manage'),
    );
    actAs(editor);
  });

  test('inserts versions on edits, reuses unchanged content, and preserves history on removal', async () => {
    actAs(editor);
    expect(
      (await updateEventTerms(eventId, '  ## Original rules  ')).success,
    ).toBe(true);
    const [original] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));
    expect(original.termsId).toBeTruthy();
    expect((await updateEventTerms(eventId, '## Original rules')).success).toBe(
      true,
    );
    const [unchanged] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));
    expect(unchanged.termsId).toBe(original.termsId);
    expect((await updateEventTerms(eventId, '## New rules')).success).toBe(
      true,
    );
    const [updated] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));
    expect(updated.termsId).not.toBe(original.termsId);
    const versions = await db
      .select()
      .from(eventTerms)
      .where(eq(eventTerms.eventId, eventId));
    expect(versions.map((v) => v.markdown).sort()).toEqual([
      '## New rules',
      '## Original rules',
    ]);
    expect((await updateEventTerms(eventId, '   ')).success).toBe(true);
    const [cleared] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));
    expect(cleared.termsId).toBeNull();
    expect(
      await db.select().from(eventTerms).where(eq(eventTerms.eventId, eventId)),
    ).toHaveLength(2);
    expect(updateTag).toHaveBeenCalledWith(`admin-event:${eventId}`);
    expect((await updateEventTerms(eventId, 'x'.repeat(20_001))).success).toBe(
      false,
    );
  });
});
