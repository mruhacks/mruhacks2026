/**
 * Server actions for organizer-authored markdown content on an event:
 * the event description shown to participants, and the per-event wiki.
 *
 * Authorization splits along the two features rather than a shared
 * "admin-ish" bundle: the description is part of the event record and rides
 * on `event:manage`, while wiki articles have their own
 * `article:read:all` / `article:write:all` so an organizer can be trusted
 * with documentation without also being handed the event settings.
 */

'use server';

import { randomUUID } from 'crypto';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';

import { getParentEventId, subeventsCacheTag } from '@/lib/subevents';
import { adminEventCacheTag } from '@/lib/admin-event';
import { db } from '@/utils/db';
import { events, eventArticles, eventTerms } from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { hasPermission, requirePermission } from '@/lib/rbac/authorization';
import { eventWikiCacheTag } from '@/lib/event-wiki';
import { eventUrlSegments } from '@/lib/events';
import { writeAuditLog } from '@/utils/audit-log';
import {
  deleteObject,
  eventAttachmentUrl,
  putObject,
} from '@/utils/object-storage';
import { collectAttachmentKeys } from '@/lib/markdown-attachments';
import { slugify, uniqueSlug, RESERVED_ARTICLE_SLUGS } from '@/lib/slug';
import {
  createArticleSchema,
  reorderArticlesSchema,
  updateArticleSchema,
  updateEventDescriptionSchema,
  updateEventTermsSchema,
  type CreateArticleInput,
  type UpdateArticleInput,
} from './schemas';

// ── Attachment uploads ────────────────────────────────────────────────────

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/**
 * Attachments are re-served verbatim from `/api/assets`, so the allow-list is
 * limited to formats a browser renders as an image and never executes. SVG is
 * deliberately excluded: it can carry script, and it would run same-origin.
 */
const ATTACHMENT_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
]);

async function storeAttachment(
  eventId: string,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const [eventRow] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!eventRow) return fail('Event not found');

  const value = formData.get('file');
  if (
    !value ||
    typeof value === 'string' ||
    typeof value.arrayBuffer !== 'function'
  ) {
    return fail('Choose an image to upload.');
  }

  const extension = ATTACHMENT_TYPES.get(value.type);
  if (!extension) {
    return fail('Images must be JPEG, PNG, WebP, GIF or AVIF.');
  }
  if (value.size === 0 || value.size > MAX_ATTACHMENT_BYTES) {
    return fail(
      `Images must be smaller than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`,
    );
  }

  try {
    const key = `event-content/${eventId}/${randomUUID()}${extension}`;
    await putObject({
      key,
      body: new Uint8Array(await value.arrayBuffer()),
      contentType: value.type,
    });
    return ok({ url: eventAttachmentUrl(key) });
  } catch (error) {
    console.error('[admin/events/content] failed to upload attachment', error);
    return fail('Unable to upload that image.');
  }
}

/**
 * Uploads an image embedded in an event's description.
 * Requires event:manage permission.
 */
export async function uploadEventDescriptionAttachment(
  eventId: string,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'event:manage');
  return storeAttachment(eventId, formData);
}

/**
 * Uploads an image embedded in a wiki article.
 * Requires article:write:all permission.
 */
export async function uploadArticleAttachment(
  eventId: string,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'article:write:all');
  return storeAttachment(eventId, formData);
}

// ── Event description ─────────────────────────────────────────────────────

/**
 * Replaces the markdown description shown on the participant event page.
 * Requires event:manage permission.
 */
export async function updateEventDescription(
  eventId: string,
  descriptionMarkdown: string,
): Promise<ActionResult> {
  return updateEventMarkdown(eventId, 'description', descriptionMarkdown);
}

/** Replaces Event Terms; existing RSVP consent version references are preserved. */
export async function updateEventTerms(
  eventId: string,
  termsMarkdown: string,
): Promise<ActionResult> {
  return updateEventMarkdown(eventId, 'terms', termsMarkdown);
}

async function updateEventMarkdown(
  eventId: string,
  kind: 'description' | 'terms',
  markdown: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'event:manage');

  const parsed =
    kind === 'terms'
      ? updateEventTermsSchema.shape.termsMarkdown.safeParse(markdown)
      : updateEventDescriptionSchema.shape.descriptionMarkdown.safeParse(
          markdown,
        );
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const trimmed = parsed.data.trim();
  const found = await db.transaction(async (tx) => {
    // Serialize terms edits with RSVP acceptance on the same event row.
    const [event] = await tx
      .select({ id: events.id, termsId: events.termsId })
      .from(events)
      .where(eq(events.id, eventId))
      .for('update')
      .limit(1);
    if (!event) return false;
    if (kind === 'description') {
      await tx
        .update(events)
        .set({ descriptionMarkdown: trimmed || null, updatedAt: new Date() })
        .where(eq(events.id, eventId));
      return true;
    }

    const [current] = event.termsId
      ? await tx
          .select({ markdown: eventTerms.markdown })
          .from(eventTerms)
          .where(eq(eventTerms.id, event.termsId))
      : [];
    if ((current?.markdown ?? '') === trimmed) return true;

    let termsId: string | null = null;
    if (trimmed) {
      const [version] = await tx
        .insert(eventTerms)
        .values({ eventId, markdown: trimmed })
        .returning({ id: eventTerms.id });
      termsId = version.id;
    }
    await tx
      .update(events)
      .set({ termsId, updatedAt: new Date() })
      .where(eq(events.id, eventId));
    return true;
  });
  if (!found) return fail('Event not found');

  updateTag(adminEventCacheTag(eventId));
  const parentEventId = await getParentEventId(eventId);
  if (parentEventId) updateTag(subeventsCacheTag(parentEventId));
  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/events/${segment}`);
  }
  await writeAuditLog({
    actorId: user.id,
    action: `event.${kind}.updated`,
    targetType: 'event',
    targetId: eventId,
    metadata: { length: trimmed.length },
  });
  return ok(kind === 'terms' ? 'Event terms saved.' : 'Description saved.');
}

// ── Wiki articles ─────────────────────────────────────────────────────────
//
// Every mutation below revalidates `/dashboard/admin/events/<id>` as well as
// the reader-facing routes: the admin wiki tab is a server-rendered parallel
// slot on that page, so without it, navigating back to the list after an edit
// shows the pre-edit rows from the router cache.

export type ArticleSummary = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  sortOrder: number;
  updatedAt: Date;
};

export type ArticleDetail = ArticleSummary & {
  eventId: string;
  bodyMarkdown: string;
};

/**
 * Lists every article for an event, drafts included.
 * Requires article:read:all permission.
 */
export async function listEventArticles(
  eventId: string,
): Promise<ActionResult<ArticleSummary[]>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'article:read:all');

  const rows = await db
    .select({
      id: eventArticles.id,
      slug: eventArticles.slug,
      title: eventArticles.title,
      published: eventArticles.published,
      sortOrder: eventArticles.sortOrder,
      updatedAt: eventArticles.updatedAt,
    })
    .from(eventArticles)
    .where(eq(eventArticles.eventId, eventId))
    .orderBy(asc(eventArticles.sortOrder), asc(eventArticles.title));

  return ok(rows);
}

/**
 * Loads one article for editing, draft or not.
 * Requires article:read:all permission.
 */
export async function getEventArticle(
  eventId: string,
  articleId: string,
): Promise<ActionResult<ArticleDetail>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'article:read:all');

  const [row] = await db
    .select()
    .from(eventArticles)
    .where(
      and(eq(eventArticles.id, articleId), eq(eventArticles.eventId, eventId)),
    )
    .limit(1);
  if (!row) return fail('Article not found');

  return ok({
    id: row.id,
    eventId: row.eventId,
    slug: row.slug,
    title: row.title,
    bodyMarkdown: row.bodyMarkdown,
    published: row.published,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt,
  });
}

/**
 * True when the caller may create or edit articles. The wiki tab is readable
 * with `article:read:all` alone, so its editing controls have to be gated on
 * the permission that actually backs them.
 */
export async function canWriteArticles(): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  return hasPermission(user.id, 'article:write:all');
}

/** Slugs already used within an event, optionally excluding one article. */
async function takenSlugs(eventId: string, exceptArticleId?: string) {
  const rows = await db
    .select({ slug: eventArticles.slug })
    .from(eventArticles)
    .where(
      exceptArticleId
        ? and(
            eq(eventArticles.eventId, eventId),
            ne(eventArticles.id, exceptArticleId),
          )
        : eq(eventArticles.eventId, eventId),
    );
  return rows.map((row) => row.slug);
}

/**
 * Creates an empty draft article. Body content is added by a follow-up
 * `updateEventArticle` from the editor.
 * Requires article:write:all permission.
 */
export async function createEventArticle(
  eventId: string,
  data: CreateArticleInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'article:write:all');

  const parsed = createArticleSchema.safeParse(data);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const [eventRow] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!eventRow) return fail('Event not found');

  const requested = parsed.data.slug ?? slugify(parsed.data.title);
  if (!requested) {
    return fail('Add a URL slug — the title has no letters or numbers to use.');
  }
  // An explicit slug that collides is a mistake worth reporting; a derived one
  // (including one that happens to land on a reserved word) is just a naming
  // coincidence, so quietly disambiguate it instead.
  const existing = await takenSlugs(eventId);
  if (parsed.data.slug && existing.includes(requested)) {
    return fail('That slug is already used by another article in this event.');
  }
  const slug = uniqueSlug(requested, [...existing, ...RESERVED_ARTICLE_SLUGS]);

  const [created] = await db
    .insert(eventArticles)
    .values({
      eventId,
      slug,
      title: parsed.data.title,
      bodyMarkdown: '',
      published: false,
      sortOrder: sql`(select coalesce(max(sort_order), -1) + 1 from event_articles where event_id = ${eventId})`,
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning({ id: eventArticles.id, slug: eventArticles.slug });

  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/admin/events/${segment}`);
    revalidatePath(`/dashboard/events/${segment}/wiki`);
  }
  updateTag(eventWikiCacheTag(eventId));

  await writeAuditLog({
    actorId: user.id,
    action: 'event.article.created',
    targetType: 'event_article',
    targetId: created.id,
    metadata: { eventId, slug: created.slug },
  });
  return ok({ id: created.id, slug: created.slug });
}

/** Saves the complete article order, including drafts, in one transaction. */
export async function reorderEventArticles(
  eventId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'article:write:all');

  const parsed = reorderArticlesSchema.safeParse(orderedIds);
  if (!parsed.success) return fail('Invalid article order.');

  const result = await db.transaction(async (tx) => {
    // Lock in a stable order so simultaneous reorders cannot interleave.
    const articles = await tx
      .select({ id: eventArticles.id })
      .from(eventArticles)
      .where(eq(eventArticles.eventId, eventId))
      .orderBy(asc(eventArticles.id))
      .for('update');
    const ids = new Set(parsed.data);
    if (
      ids.size !== parsed.data.length ||
      ids.size !== articles.length ||
      !articles.every((article) => ids.has(article.id))
    ) {
      return fail('The article list has changed. Refresh and try again.');
    }

    for (const [sortOrder, id] of parsed.data.entries()) {
      await tx
        .update(eventArticles)
        .set({ sortOrder, updatedBy: user.id, updatedAt: new Date() })
        .where(
          and(eq(eventArticles.id, id), eq(eventArticles.eventId, eventId)),
        );
    }
    return ok('Articles reordered.');
  });
  if (!result.success) return result;

  updateTag(eventWikiCacheTag(eventId));
  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/admin/events/${segment}`);
    revalidatePath(`/dashboard/events/${segment}/wiki`);
  }
  await writeAuditLog({
    actorId: user.id,
    action: 'event.articles.reordered',
    targetType: 'event',
    targetId: eventId,
    metadata: { orderedIds: parsed.data },
  });
  return result;
}

/**
 * Updates an article's title, slug, body, publish state or ordering. Every
 * field is optional so the editor can save the body without restating the
 * rest, and the publish toggle can flip on its own.
 * Requires article:write:all permission.
 */
export async function updateEventArticle(
  eventId: string,
  articleId: string,
  data: UpdateArticleInput,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'article:write:all');

  const parsed = updateArticleSchema.safeParse(data);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const input = parsed.data;
  const [existing] = await db
    .select({ id: eventArticles.id, slug: eventArticles.slug })
    .from(eventArticles)
    .where(
      and(eq(eventArticles.id, articleId), eq(eventArticles.eventId, eventId)),
    )
    .limit(1);
  if (!existing) return fail('Article not found');

  if (input.slug && input.slug !== existing.slug) {
    const taken = await takenSlugs(eventId, articleId);
    if (taken.includes(input.slug)) {
      return fail(
        'That slug is already used by another article in this event.',
      );
    }
  }

  await db
    .update(eventArticles)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.bodyMarkdown !== undefined
        ? { bodyMarkdown: input.bodyMarkdown }
        : {}),
      ...(input.published !== undefined ? { published: input.published } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(eventArticles.id, articleId));

  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/admin/events/${segment}`);
    revalidatePath(`/dashboard/events/${segment}/wiki`);
    revalidatePath(
      `/dashboard/events/${segment}/wiki/${input.slug ?? existing.slug}`,
    );
    // A rename leaves the old URL live in caches until it is dropped too.
    if (input.slug && input.slug !== existing.slug) {
      revalidatePath(`/dashboard/events/${segment}/wiki/${existing.slug}`);
    }
  }
  updateTag(eventWikiCacheTag(eventId));

  await writeAuditLog({
    actorId: user.id,
    action: 'event.article.updated',
    targetType: 'event_article',
    targetId: articleId,
    metadata: { eventId, fields: Object.keys(input) },
  });
  return ok('Article saved.');
}

/**
 * Deletes an article and any attachments it was the last user of.
 * Requires article:write:all permission.
 */
export async function deleteEventArticle(
  eventId: string,
  articleId: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'article:write:all');

  const [existing] = await db
    .select({
      id: eventArticles.id,
      slug: eventArticles.slug,
      bodyMarkdown: eventArticles.bodyMarkdown,
    })
    .from(eventArticles)
    .where(
      and(eq(eventArticles.id, articleId), eq(eventArticles.eventId, eventId)),
    )
    .limit(1);
  if (!existing) return fail('Article not found');

  await db.delete(eventArticles).where(eq(eventArticles.id, articleId));

  await deleteOrphanedAttachments(eventId, existing.bodyMarkdown);

  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/admin/events/${segment}`);
    revalidatePath(`/dashboard/events/${segment}/wiki`);
    revalidatePath(`/dashboard/events/${segment}/wiki/${existing.slug}`);
  }
  updateTag(eventWikiCacheTag(eventId));

  await writeAuditLog({
    actorId: user.id,
    action: 'event.article.deleted',
    targetType: 'event_article',
    targetId: articleId,
    metadata: { eventId, slug: existing.slug },
  });
  return ok('Article deleted.');
}

/**
 * Drops attachments that `removedMarkdown` referenced and nothing else in the
 * event still does. Best-effort: a storage failure here must not turn an
 * already-committed delete into an error the organizer sees as "it failed".
 */
async function deleteOrphanedAttachments(
  eventId: string,
  removedMarkdown: string,
) {
  const candidates = collectAttachmentKeys(removedMarkdown);
  if (candidates.size === 0) return;

  try {
    const [remainingArticles, [eventRow], termsVersions] = await Promise.all([
      db
        .select({ bodyMarkdown: eventArticles.bodyMarkdown })
        .from(eventArticles)
        .where(eq(eventArticles.eventId, eventId)),
      db
        .select({ descriptionMarkdown: events.descriptionMarkdown })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1),
      db
        .select({ markdown: eventTerms.markdown })
        .from(eventTerms)
        .where(eq(eventTerms.eventId, eventId)),
    ]);

    const stillReferenced = new Set<string>();
    for (const markdown of termsVersions.map((row) => row.markdown)) {
      for (const key of collectAttachmentKeys(markdown))
        stillReferenced.add(key);
    }
    for (const row of remainingArticles) {
      for (const key of collectAttachmentKeys(row.bodyMarkdown)) {
        stillReferenced.add(key);
      }
    }
    for (const key of collectAttachmentKeys(eventRow?.descriptionMarkdown)) {
      stillReferenced.add(key);
    }

    await Promise.all(
      [...candidates]
        .filter((key) => !stillReferenced.has(key))
        .map((key) => deleteObject(key)),
    );
  } catch (error) {
    console.error('[admin/events/content] failed to clean up attachments', {
      eventId,
      error,
    });
  }
}
