/**
 * Server actions for a team's project submission: the participant editor at
 * dashboard/events/:id/project, and the read-only organizer views at
 * dashboard/admin/events/:id/submissions and dashboard/events/:id/projects/:id.
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

import {
  submissionEditors,
  submissions,
  teamMembers,
  user as authUser,
} from '@/db/schema';
import { eventApplicationsCacheTag } from '@/lib/admin-event';
import { eventUrlSegments } from '@/lib/events';
import { collectAttachmentKeys } from '@/lib/markdown-attachments';
import { readImageUpload } from '@/lib/image-attachments';
import { requirePermission, hasPermission } from '@/lib/rbac/authorization';
import {
  loadSubmissionAccess,
  type SubmissionAccess,
  type SubmissionRow,
} from '@/lib/submission-access';
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
  deleteObject,
  eventAttachmentUrl,
  parseSubmissionAttachmentKey,
  putObject,
  submissionAttachmentPrefix,
} from '@/utils/object-storage';
import {
  publishSubmissionSchema,
  saveSubmissionSchema,
  type SaveSubmissionInput,
} from './submission-schemas';

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
  submissionWindow: SubmissionWindow;
  opensAt: Date | null;
  closesAt: Date | null;
  submission: SubmissionView | null;
};

async function toView(row: SubmissionRow): Promise<SubmissionView> {
  const [editor] = row.lastEditedBy
    ? await db
        .select({ name: authUser.name })
        .from(authUser)
        .where(eq(authUser.id, row.lastEditedBy))
        .limit(1)
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
  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/events/${segment}`);
    revalidatePath(`/dashboard/events/${segment}/project`);
    revalidatePath(`/dashboard/admin/events/${segment}/submissions`);
  }
}

/**
 * The submission's own image keys: everything under its storage prefix that
 * its markdown or cover points at. Anything else a URL might name (another
 * project's image, a wiki attachment) is never this submission's to count
 * or delete.
 */
function ownImageKeys(
  submissionId: string,
  markdown: string,
  coverImageUrl: string | null,
): Set<string> {
  const prefix = submissionAttachmentPrefix(submissionId);
  const keys = new Set(
    [...collectAttachmentKeys(markdown)].filter((key) =>
      key.startsWith(prefix),
    ),
  );
  const coverKey = parseSubmissionAttachmentKey(coverImageUrl);
  if (coverKey?.startsWith(prefix)) keys.add(coverKey);
  return keys;
}

/** Best effort: the row is already gone, so a storage hiccup only leaves orphans. */
async function deleteSubmissionImages(row: SubmissionRow): Promise<void> {
  try {
    await Promise.all(
      [...ownImageKeys(row.id, row.markdown, row.coverImageUrl)].map((key) =>
        deleteObject(key),
      ),
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
export async function getMySubmission(
  eventId: string,
): Promise<ActionResult<MySubmissionState>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access) return fail('Event not found.');
  if (!access.eligible || access.submissionWindow === 'disabled') {
    return fail('Project submissions are not available to you.');
  }

  return ok({
    submissionWindow: access.submissionWindow,
    opensAt: access.event.startsAt,
    closesAt: access.event.submissionsCloseAt,
    submission: access.submission ? await toView(access.submission) : null,
  });
}

// ── Participant: write ────────────────────────────────────────────────────

/**
 * Starts the team's project as an empty draft. The row has to exist before
 * the editor opens, because uploaded images are stored under its id.
 */
export async function createSubmission(
  eventId: string,
): Promise<ActionResult<{ id: string }>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access) return fail('Event not found.');
  const blocked = editBlockedReason(access);
  if (blocked) return fail(blocked);
  if (access.submission) return ok({ id: access.submission.id });

  try {
    const created = await db.transaction(async (tx) => {
      const { teamId } = await getOrCreatePersonalTeam(
        currentUser.id,
        eventId,
        tx,
      );
      const now = new Date();
      const [row] = await tx
        .insert(submissions)
        .values({
          eventId,
          teamId,
          title: NEW_SUBMISSION_TITLE,
          lastEditedBy: currentUser.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: submissions.teamId })
        .returning({ id: submissions.id });
      if (row) return row;
      // A teammate started it a moment ago: open theirs.
      const [existing] = await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.teamId, teamId))
        .limit(1);
      return existing!;
    });
    await revalidateSubmissionPaths(eventId);
    return ok({ id: created.id });
  } catch (error) {
    console.error('createSubmission error:', error);
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
        .from(submissions)
        .where(eq(submissions.id, access.submission.id))
        .limit(1)
        .for('update');
      if (!row) return fail('Your project no longer exists.');

      if (
        !data.force &&
        row.updatedAt.getTime() > new Date(data.expectedUpdatedAt).getTime()
      ) {
        const [editor] = row.lastEditedBy
          ? await tx
              .select({ name: authUser.name })
              .from(authUser)
              .where(eq(authUser.id, row.lastEditedBy))
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
      if (
        ownImageKeys(row.id, data.markdown, data.coverImageUrl).size >
        SUBMISSION_MAX_IMAGES
      ) {
        return fail(
          `A project can have at most ${SUBMISSION_MAX_IMAGES} images, including the cover.`,
        );
      }
      if (row.published && !data.repoUrl) {
        return fail(
          'A public project needs a repository link. Make it private first to remove the link.',
        );
      }

      const updatedAt = new Date();
      await tx
        .update(submissions)
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
        .where(eq(submissions.id, row.id));

      return ok<SaveSubmissionResult>({ status: 'saved', updatedAt });
    });
    if (result.success && result.data?.status === 'saved') {
      await revalidateSubmissionPaths(eventId);
    }
    return result;
  } catch (error) {
    console.error('saveSubmission error:', error);
    return fail('Failed to save your project.');
  }
}

/**
 * Makes the team's project public (judged) or private again. Any eligible
 * member may, any time the window is open. Going public needs a repository
 * link.
 */
export async function setSubmissionPublished(
  eventId: string,
  published: boolean,
): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access) return fail('Event not found.');
  const blocked = editBlockedReason(access);
  if (blocked) return fail(blocked);
  if (!access.submission) return fail('Start your project first.');
  if (published) {
    const ready = publishSubmissionSchema.safeParse(access.submission);
    if (!ready.success) {
      return fail(ready.error.issues[0]?.message ?? 'Invalid project');
    }
  }

  try {
    await db
      .update(submissions)
      .set({
        published,
        publishedAt: published ? new Date() : null,
        // `updatedAt` tracks content saves for the stale-save check; flipping
        // the flag isn't one, so a teammate mid-edit isn't told to reload.
        updatedAt: sql`${submissions.updatedAt}`,
      })
      .where(eq(submissions.id, access.submission.id));
    await revalidateSubmissionPaths(eventId);
    return ok(published ? 'Project is now public.' : 'Project is now private.');
  } catch (error) {
    console.error('setSubmissionPublished error:', error);
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
      .delete(submissions)
      .where(eq(submissions.id, access.submission.id))
      .returning();
    if (deleted) await deleteSubmissionImages(deleted);
    await revalidateSubmissionPaths(eventId);
    return ok('Project deleted.');
  } catch (error) {
    console.error('deleteSubmission error:', error);
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

  try {
    const key = `${submissionAttachmentPrefix(access.submission.id)}${randomUUID()}${upload.extension}`;
    await putObject({
      key,
      body: upload.bytes,
      contentType: upload.contentType,
    });
    return ok({ url: eventAttachmentUrl(key) });
  } catch (error) {
    console.error('Submission attachment upload error:', error);
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
export async function heartbeatSubmissionEditor(
  eventId: string,
): Promise<ActionResult<SubmissionEditorPresence[]>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access) return fail('Event not found.');
  if (editBlockedReason(access) || !access.submission) return ok([]);
  const submissionId = access.submission.id;

  try {
    const now = new Date();
    await db
      .insert(submissionEditors)
      .values({ submissionId, userId: currentUser.id, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [submissionEditors.submissionId, submissionEditors.userId],
        set: { lastSeenAt: now },
      });

    const others = await db
      .select({ userId: submissionEditors.userId, name: authUser.name })
      .from(submissionEditors)
      .innerJoin(authUser, eq(authUser.id, submissionEditors.userId))
      .where(
        and(
          eq(submissionEditors.submissionId, submissionId),
          ne(submissionEditors.userId, currentUser.id),
          gt(
            submissionEditors.lastSeenAt,
            new Date(now.getTime() - SUBMISSION_PRESENCE_WINDOW_MS),
          ),
        ),
      )
      .orderBy(asc(authUser.name));
    return ok(others);
  } catch (error) {
    console.error('heartbeatSubmissionEditor error:', error);
    return fail('Failed to update editor presence.');
  }
}

/** Clears the caller's presence row when the editor closes. Best effort. */
export async function leaveSubmissionEditor(
  eventId: string,
): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const access = await loadSubmissionAccess(currentUser.id, eventId);
  if (!access?.submission) return ok();

  await db
    .delete(submissionEditors)
    .where(
      and(
        eq(submissionEditors.submissionId, access.submission.id),
        eq(submissionEditors.userId, currentUser.id),
      ),
    );
  return ok();
}

// ── Admin ────────────────────────────────────────────────────────────────

export type AdminSubmissionRow = {
  id: string;
  title: string;
  published: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  members: string[];
};

async function teamMemberNames(
  teamIds: string[],
): Promise<Map<string, string[]>> {
  const byTeam = new Map<string, string[]>();
  if (teamIds.length === 0) return byTeam;
  const rows = await db
    .select({ teamId: teamMembers.teamId, name: authUser.name })
    .from(teamMembers)
    .innerJoin(authUser, eq(authUser.id, teamMembers.userId))
    .where(inArray(teamMembers.teamId, teamIds))
    .orderBy(asc(teamMembers.joinedAt));
  for (const row of rows) {
    byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), row.name]);
  }
  return byTeam;
}

/**
 * Every submission for an event, drafts included.
 * Requires submission:read:all permission.
 */
export async function listEventSubmissions(
  eventId: string,
): Promise<ActionResult<AdminSubmissionRow[]>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');
  await requirePermission(currentUser.id, 'submission:read:all');

  const rows = await db
    .select({
      id: submissions.id,
      teamId: submissions.teamId,
      title: submissions.title,
      published: submissions.published,
      publishedAt: submissions.publishedAt,
      updatedAt: submissions.updatedAt,
    })
    .from(submissions)
    .where(eq(submissions.eventId, eventId))
    .orderBy(desc(submissions.published), asc(submissions.title));

  const names = await teamMemberNames(rows.map((row) => row.teamId));
  return ok(
    rows.map(({ teamId, ...row }) => ({
      ...row,
      members: names.get(teamId) ?? [],
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
  await requirePermission(currentUser.id, 'submission:read:all');

  const [row] = await db
    .select()
    .from(submissions)
    .where(
      and(eq(submissions.id, submissionId), eq(submissions.eventId, eventId)),
    )
    .limit(1);
  if (!row) return fail('Submission not found.');

  const names = await teamMemberNames([row.teamId]);
  return ok({ ...(await toView(row)), members: names.get(row.teamId) ?? [] });
}

/**
 * True when the caller may take down any submission. The submissions pages
 * are readable with `submission:read:all` alone, so the delete control has
 * to be gated on the permission that actually backs it.
 */
export async function canDeleteAnySubmission(): Promise<boolean> {
  const currentUser = await getUser();
  if (!currentUser) return false;
  return hasPermission(currentUser.id, 'submission:delete:all');
}

/**
 * Moderation/takedown: deletes any submission and its images, at any time —
 * the deadline doesn't apply. Audit-logged by id.
 * Requires submission:delete:all permission.
 */
export async function adminDeleteSubmission(
  eventId: string,
  submissionId: string,
): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');
  if (!(await hasPermission(currentUser.id, 'submission:delete:all'))) {
    return fail('Not authorized to delete submissions.');
  }

  try {
    const [deleted] = await db
      .delete(submissions)
      .where(
        and(eq(submissions.id, submissionId), eq(submissions.eventId, eventId)),
      )
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
    console.error('adminDeleteSubmission error:', error);
    return fail('Failed to delete the submission.');
  }
}
