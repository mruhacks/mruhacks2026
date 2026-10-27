/**
 * Server actions for a team's project submission: the participant editor at
 * dashboard/events/:id/project, and the read-only organizer views at
 * dashboard/admin/events/:id/teams and dashboard/events/:id/projects/:id.
 *
 * A submission belongs to a team (every participant has one — a team-of-one is
 * a normal team), at most one per team. Only *eligible* members
 * (`canSubmitProject`) can see or touch it, and only while the window is open
 * (`getSubmissionWindow`): at the deadline the content and the published
 * flag both freeze.
 *
 * Admins never edit. `submission:read:all` reads every team's project, drafts
 * included; `submission:delete:all` takes one down at any time.
 */

'use server';

import { randomUUID } from 'crypto';
import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';

import * as schema from '@/db/schema';
import { eventApplicationsCacheTag } from '@/lib/admin-event';
import { eventUrlSegments } from '@/lib/events';
import * as Judging from '@/lib/judging/server';
import { PROJECT_SHOWCASE_CACHE_TAG } from '@/lib/project-showcase';
import { readImageUpload } from '@/lib/image-attachments';
import * as Rbac from '@/lib/rbac/server';
import { loadSubmissionAccess, type SubmissionAccess, type SubmissionRow } from '@/lib/submission-access';
import {
  createSubmissionImageVariants,
  deleteSubmissionImage,
  putSubmissionImageVariants,
  submissionImageKeys,
  type SubmissionImageVariant,
} from '@/lib/submission-image-variants';
import {
  NEW_SUBMISSION_TITLE,
  SUBMISSION_MAX_IMAGES,
  SUBMISSION_PRESENCE_WINDOW_MS,
  type SubmissionWindow,
} from '@/lib/submissions';
import { getOrCreatePersonalTeam } from '@/lib/team-membership';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import { writeAuditLog } from '@/utils/audit-log';
import { db } from '@/utils/db';
import {
  eventAttachmentUrl,
  parseSubmissionAttachmentKey,
  putObject,
  submissionAttachmentPrefix,
} from '@/utils/object-storage';
import { publishSubmissionSchema, saveSubmissionSchema, type SaveSubmissionInput } from './submission-schemas';

// ── Shared shapes ─────────────────────────────────────────────────────────

export type SubmissionView = {
  id: string;
  eventId: string;
  teamId: string;
  title: string;
  markdown: string;
  coverImageUrl: string | null;
  repoUrl: string | null;
  demoUrl: string | null;
  videoUrl: string | null;
  published: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  /**
   * Who saved last. Null once that member deleted their account — shown as
   * "[deleted user]". Every save stamps it, so it's never null otherwise.
   */
  lastEditedByName: string | null;
};

export type MySubmissionState = {
  /** Never `disabled`: `getMySubmission` refuses those events outright. */
  submissionWindow: Exclude<SubmissionWindow, 'disabled'>;
  opensAt: Date | null;
  closesAt: Date | null;
  submission: SubmissionView | null;
  /**
   * The project's expo table. Judges see it throughout, participants only
   * once submissions close — and only for a project that will be judged.
   */
  tableLabel: string | null;
};

async function toView(row: SubmissionRow): Promise<SubmissionView> {
  const [editor] = row.lastEditedBy
    ? await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, row.lastEditedBy)).limit(1)
    : [];
  return {
    id: row.id,
    eventId: row.eventId,
    teamId: row.teamId,
    title: row.title,
    markdown: row.markdown,
    coverImageUrl: row.coverImageUrl,
    repoUrl: row.repoUrl,
    demoUrl: row.demoUrl,
    videoUrl: row.videoUrl,
    published: row.published,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    lastEditedByName: editor?.name ?? null,
  };
}

/** Why the caller can't change their team's submission right now, or null. */
function editBlockedReason(access: SubmissionAccess): string | null {
  if (!access.eligible) return 'Project submissions are not available to you.';
  switch (access.submissionWindow) {
    case 'disabled':
      return 'This event is not taking project submissions.';
    case 'not_open':
      return 'Project submissions have not opened yet.';
    case 'closed':
      return 'The submission deadline has passed. Projects are final.';
    case 'open':
      return null;
  }
}

async function revalidateSubmissionPaths(eventId: string): Promise<void> {
  updateTag(eventApplicationsCacheTag(eventId));
  updateTag(PROJECT_SHOWCASE_CACHE_TAG);
  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/events/${segment}`);
    revalidatePath(`/dashboard/events/${segment}/project`);
    revalidatePath(`/dashboard/admin/events/${segment}/teams`);
  }
}

/** Best effort: the row is already gone, so a storage hiccup only leaves orphans. */
async function deleteSubmissionImages(row: SubmissionRow): Promise<void> {
  try {
    await Promise.all(
      [...submissionImageKeys(row.id, row.markdown, row.coverImageUrl)].map((key) => deleteSubmissionImage(key)),
    );
  } catch (error) {
    console.error('[submissions] failed to delete submission images', {
      submissionId: row.id,
      error,
    });
  }
}

// ── Participant: read ─────────────────────────────────────────────────────

/**
 * The caller's team's submission and the event's window. Fails for anyone
 * not eligible — an ineligible teammate (e.g. not yet checked in) can't see
 * the project at all.
 */
export async function getMySubmission(eventId: string): Promise<ActionResult<MySubmissionState>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access) return fail('Event not found.');
  const { submissionWindow } = access;
  if (!access.eligible || submissionWindow === 'disabled') {
    return fail('Project submissions are not available to you.');
  }

  const { submission } = access;
  const tableLabel =
    submissionWindow === 'closed' && submission?.published
      ? ((await Judging.getTableLabels(eventId)).get(submission.id)?.label ?? null)
      : null;

  return ok({
    submissionWindow,
    opensAt: access.event.startsAt,
    closesAt: access.event.submissionsCloseAt,
    submission: submission ? await toView(submission) : null,
    tableLabel,
  });
}

// ── Participant: write ────────────────────────────────────────────────────

/**
 * Starts the team's project as an empty draft. The row has to exist before
 * the editor opens, because uploaded images are stored under its id.
 */
export async function createSubmission(eventId: string): Promise<ActionResult<{ id: string }>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access) return fail('Event not found.');
  const blocked = editBlockedReason(access);
  if (blocked) return fail(blocked);
  if (access.submission) return ok({ id: access.submission.id });

  try {
    const created = await db.transaction(async (tx) => {
      const { teamId } = await getOrCreatePersonalTeam(currentUser.id, eventId, tx);
      const now = new Date();
      const [row] = await tx
        .insert(schema.submissions)
        .values({
          eventId,
          teamId,
          title: NEW_SUBMISSION_TITLE,
          lastEditedBy: currentUser.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: schema.submissions.teamId })
        .returning({ id: schema.submissions.id });
      if (row) return row;
      // A teammate started it a moment ago: open theirs.
      const [existing] = await tx
        .select({ id: schema.submissions.id })
        .from(schema.submissions)
        .where(eq(schema.submissions.teamId, teamId))
        .limit(1);
      return existing!;
    });
    await revalidateSubmissionPaths(eventId);
    return ok({ id: created.id });
  } catch (error) {
    console.error('[team/submission] createSubmission error:', error);
    return fail('Failed to start your project.');
  }
}

export type SaveSubmissionResult =
  | { status: 'saved'; updatedAt: Date }
  /**
   * Nothing was written: a teammate saved after this editor loaded. The
   * editor offers "Overwrite with mine" (resend with `force`) or "Discard
   * mine and reload".
   */
  | { status: 'conflict'; updatedAt: Date; lastEditedByName: string | null };

/**
 * Saves the write-up and links. Never touches the published flag — a
 * published project is live, so these edits show up straight away.
 */
export async function saveSubmission(
  eventId: string,
  input: SaveSubmissionInput,
): Promise<ActionResult<SaveSubmissionResult>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const parsed = saveSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const data = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const access = await loadSubmissionAccess(currentUser.id, eventId, tx);
      if (!access) return fail('Event not found.');
      const blocked = editBlockedReason(access);
      if (blocked) return fail(blocked);
      if (!access.submission) return fail('Start your project first.');

      // Locked so a teammate's concurrent save can't slip between the
      // staleness check and the write.
      const [row] = await tx
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.id, access.submission.id))
        .limit(1)
        .for('update');
      if (!row) return fail('Your project no longer exists.');

      if (!data.force && row.updatedAt.getTime() > new Date(data.expectedUpdatedAt).getTime()) {
        const [editor] = row.lastEditedBy
          ? await tx
              .select({ name: schema.user.name })
              .from(schema.user)
              .where(eq(schema.user.id, row.lastEditedBy))
              .limit(1)
          : [];
        return ok<SaveSubmissionResult>({
          status: 'conflict',
          updatedAt: row.updatedAt,
          lastEditedByName: editor?.name ?? null,
        });
      }

      const prefix = submissionAttachmentPrefix(row.id);
      const coverKey = parseSubmissionAttachmentKey(data.coverImageUrl);
      if (data.coverImageUrl && !coverKey?.startsWith(prefix)) {
        return fail('Upload the cover image here rather than linking one.');
      }
      if (submissionImageKeys(row.id, data.markdown, data.coverImageUrl).size > SUBMISSION_MAX_IMAGES) {
        return fail(`A project can have at most ${SUBMISSION_MAX_IMAGES} images, including the cover.`);
      }
      if (row.published && !data.repoUrl) {
        return fail('A public project needs a repository link. Make it private first to remove the link.');
      }

      const updatedAt = new Date();
      await tx
        .update(schema.submissions)
        .set({
          title: data.title,
          markdown: data.markdown,
          coverImageUrl: data.coverImageUrl,
          repoUrl: data.repoUrl,
          demoUrl: data.demoUrl,
          videoUrl: data.videoUrl,
          lastEditedBy: currentUser.id,
          updatedAt,
        })
        .where(eq(schema.submissions.id, row.id));

      return ok<SaveSubmissionResult>({ status: 'saved', updatedAt });
    });
    if (result.success && result.data?.status === 'saved') {
      await revalidateSubmissionPaths(eventId);
    }
    return result;
  } catch (error) {
    console.error('[team/submission] saveSubmission error:', error);
    return fail('Failed to save your project.');
  }
}

/**
 * Makes the team's project public (judged) or private again. Any eligible
 * member may, any time the window is open. Going public needs a repository
 * link.
 */
export async function setSubmissionPublished(eventId: string, published: boolean): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  try {
    const result = await db.transaction(async (tx) => {
      const access = await loadSubmissionAccess(currentUser.id, eventId, tx);
      if (!access) return fail('Event not found.');
      const blocked = editBlockedReason(access);
      if (blocked) return fail(blocked);
      if (!access.submission) return fail('Start your project first.');

      // Checked against the locked row, as `saveSubmission` does: otherwise a
      // teammate's concurrent save clearing the repo link could land between
      // this check and the write, leaving a public project without one.
      const [row] = await tx
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.id, access.submission.id))
        .limit(1)
        .for('update');
      if (!row) return fail('Your project no longer exists.');
      if (published) {
        const ready = publishSubmissionSchema.safeParse(row);
        if (!ready.success) {
          return fail(ready.error.issues[0]?.message ?? 'Invalid project');
        }
      }

      await tx
        .update(schema.submissions)
        .set({
          published,
          publishedAt: published ? new Date() : null,
          // Leaving the results pool gives up any placement, so the place
          // isn't stuck on a project the awards page no longer lists.
          ...(published ? {} : { placement: null }),
          // `updatedAt` tracks content saves for the stale-save check;
          // flipping the flag isn't one, so a teammate mid-edit isn't told
          // to reload.
          updatedAt: sql`${schema.submissions.updatedAt}`,
        })
        .where(eq(schema.submissions.id, row.id));
      // First time public: the project takes its expo table for good.
      if (published) await Judging.assignTableSlot(tx, eventId, row.id);
      return ok(published ? 'Project is now public.' : 'Project is now private.');
    });
    if (result.success) await revalidateSubmissionPaths(eventId);
    return result;
  } catch (error) {
    console.error('[team/submission] setSubmissionPublished error:', error);
    return fail('Failed to update your project.');
  }
}

/** Deletes the team's project and its images. Not after the deadline. */
export async function deleteSubmission(eventId: string): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access) return fail('Event not found.');
  const blocked = editBlockedReason(access);
  if (blocked) return fail(blocked);
  if (!access.submission) return fail('Your team has no project to delete.');

  try {
    const [deleted] = await db
      .delete(schema.submissions)
      .where(eq(schema.submissions.id, access.submission.id))
      .returning();
    if (deleted) await deleteSubmissionImages(deleted);
    await revalidateSubmissionPaths(eventId);
    return ok('Project deleted.');
  } catch (error) {
    console.error('[team/submission] deleteSubmission error:', error);
    return fail('Failed to delete your project.');
  }
}

/** Stores an image for the team's project and returns the URL to embed. */
export async function uploadSubmissionAttachment(
  eventId: string,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access) return fail('Event not found.');
  const blocked = editBlockedReason(access);
  if (blocked) return fail(blocked);
  if (!access.submission) return fail('Start your project first.');

  const read = await readImageUpload(formData);
  if ('error' in read) return fail(read.error);
  const { upload } = read;

  let variants: SubmissionImageVariant[];
  try {
    variants = await createSubmissionImageVariants(upload.bytes);
  } catch (error) {
    console.warn('[team/submission] could not process submission image', error);
    return fail('That image could not be read. Try a different file.');
  }

  try {
    const key = `${submissionAttachmentPrefix(access.submission.id)}${randomUUID()}${upload.extension}`;
    // The original stays private (it may carry EXIF/GPS); pages show the
    // public resized copies — see `@/lib/submission-images`.
    await Promise.all([
      putObject({
        key,
        body: upload.bytes,
        contentType: upload.contentType,
      }),
      putSubmissionImageVariants(key, variants),
    ]);
    return ok({ url: eventAttachmentUrl(key) });
  } catch (error) {
    console.error('[team/submission] Submission attachment upload error:', error);
    return fail('Unable to upload that image.');
  }
}

// ── Participant: editor presence ──────────────────────────────────────────

export type SubmissionEditorPresence = { userId: string; name: string };

/**
 * Marks the caller as having the editor open, and returns the teammates who
 * have done the same within the presence window — the editor's "<name> is
 * also editing" banner.
 */
export async function heartbeatSubmissionEditor(eventId: string): Promise<ActionResult<SubmissionEditorPresence[]>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access) return fail('Event not found.');
  if (editBlockedReason(access) || !access.submission) return ok([]);
  const submissionId = access.submission.id;

  try {
    const now = new Date();
    await db
      .insert(schema.submissionEditors)
      .values({ submissionId, userId: currentUser.id, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [schema.submissionEditors.submissionId, schema.submissionEditors.userId],
        set: { lastSeenAt: now },
      });

    const others = await db
      .select({ userId: schema.submissionEditors.userId, name: schema.user.name })
      .from(schema.submissionEditors)
      .innerJoin(schema.user, eq(schema.user.id, schema.submissionEditors.userId))
      .where(
        and(
          eq(schema.submissionEditors.submissionId, submissionId),
          ne(schema.submissionEditors.userId, currentUser.id),
          gt(schema.submissionEditors.lastSeenAt, new Date(now.getTime() - SUBMISSION_PRESENCE_WINDOW_MS)),
        ),
      )
      .orderBy(asc(schema.user.name));
    return ok(others);
  } catch (error) {
    console.error('[team/submission] heartbeatSubmissionEditor error:', error);
    return fail('Failed to update editor presence.');
  }
}

/** Clears the caller's presence row when the editor closes. Best effort. */
export async function leaveSubmissionEditor(eventId: string): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access?.submission) return ok();

  await db
    .delete(schema.submissionEditors)
    .where(
      and(
        eq(schema.submissionEditors.submissionId, access.submission.id),
        eq(schema.submissionEditors.userId, currentUser.id),
      ),
    );
  return ok();
}

// ── Admin ────────────────────────────────────────────────────────────────

export type AdminSubmissionRow = {
  id: string;
  teamId: string;
  title: string;
  published: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  members: string[];
};

async function teamMemberNames(teamIds: string[]): Promise<Map<string, string[]>> {
  const byTeam = new Map<string, string[]>();
  if (teamIds.length === 0) return byTeam;
  const rows = await db
    .select({ teamId: schema.teamMembers.teamId, name: schema.user.name })
    .from(schema.teamMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.teamMembers.userId))
    .where(inArray(schema.teamMembers.teamId, teamIds))
    .orderBy(asc(schema.teamMembers.joinedAt));
  for (const row of rows) {
    byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), row.name]);
  }
  return byTeam;
}

/**
 * Every submission for an event, drafts included.
 * Requires submission:read:all permission.
 */
export async function listEventSubmissions(eventId: string): Promise<ActionResult<AdminSubmissionRow[]>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');
  await Rbac.requirePermission(currentUser.id, 'submission:read:all');

  const rows = await db
    .select({
      id: schema.submissions.id,
      teamId: schema.submissions.teamId,
      title: schema.submissions.title,
      published: schema.submissions.published,
      publishedAt: schema.submissions.publishedAt,
      updatedAt: schema.submissions.updatedAt,
    })
    .from(schema.submissions)
    .where(eq(schema.submissions.eventId, eventId))
    .orderBy(desc(schema.submissions.published), asc(schema.submissions.title));

  const names = await teamMemberNames(rows.map((row) => row.teamId));
  return ok(
    rows.map((row) => ({
      ...row,
      members: names.get(row.teamId) ?? [],
    })),
  );
}

/**
 * One submission, read-only, draft or not.
 * Requires submission:read:all permission.
 */
export async function getEventSubmission(
  eventId: string,
  submissionId: string,
): Promise<ActionResult<SubmissionView & { members: string[] }>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');
  await Rbac.requirePermission(currentUser.id, 'submission:read:all');

  const [row] = await db
    .select()
    .from(schema.submissions)
    .where(and(eq(schema.submissions.id, submissionId), eq(schema.submissions.eventId, eventId)))
    .limit(1);
  if (!row) return fail('Submission not found.');

  const names = await teamMemberNames([row.teamId]);
  return ok({ ...(await toView(row)), members: names.get(row.teamId) ?? [] });
}

/**
 * True when the caller may take down any submission. The project pages
 * are readable with `submission:read:all` alone, so the delete control has
 * to be gated on the permission that actually backs it.
 */
export async function canDeleteAnySubmission(): Promise<boolean> {
  const currentUser = await getUser();
  if (!currentUser) return false;
  return Rbac.hasPermission(currentUser.id, 'submission:delete:all');
}

/**
 * Moderation/takedown: deletes any submission and its images, at any time —
 * the deadline doesn't apply. Audit-logged by id.
 * Requires submission:delete:all permission.
 */
export async function adminDeleteSubmission(eventId: string, submissionId: string): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');
  if (!(await Rbac.hasPermission(currentUser.id, 'submission:delete:all'))) {
    return fail('Not authorized to delete submissions.');
  }

  try {
    const [deleted] = await db
      .delete(schema.submissions)
      .where(and(eq(schema.submissions.id, submissionId), eq(schema.submissions.eventId, eventId)))
      .returning();
    if (!deleted) return fail('Submission not found.');

    await deleteSubmissionImages(deleted);
    await revalidateSubmissionPaths(eventId);
    await writeAuditLog({
      actorId: currentUser.id,
      action: 'submission.deleted',
      targetType: 'submission',
      targetId: submissionId,
      metadata: { eventId },
    });
    return ok('Submission deleted.');
  } catch (error) {
    console.error('[team/submission] adminDeleteSubmission error:', error);
    return fail('Failed to delete the submission.');
  }
}
