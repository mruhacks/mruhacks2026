/**
 * Server actions for organizing expo judging, under
 * dashboard/admin/events/:id/judging.
 *
 * - `judging:manage:all`: criteria, weights, the table layout, the judge
 *   roster, and deactivating projects.
 * - `judging:results:all`: the live rankings.
 * - `judging:award:all`: overall placements.
 *
 * Judges themselves never come through here; see `@/app/dashboard/events/judge-actions`.
 */

'use server';

import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  session as authSession,
  eventJudges,
  events,
  judgeState,
  judgingCriteria,
  judgingVotes,
  submissions,
  user as authUser,
} from '@/db/schema';
import {
  claimMagicLinkCooldown,
  releaseMagicLinkCooldown,
} from '@/lib/auth/magic-link-cooldown';
import { eventUrlSegments } from '@/lib/events';
import { JUDGE_PRIOR } from '@/lib/judging/crowd-bt';
import {
  checkJudgeInviteRateLimit,
  JUDGE_INVITE_RATE_LIMITED,
} from '@/lib/judging/invite-rate-limit';
import { sendJudgeInvite } from '@/lib/judging/judge-invite';
import {
  CRITERION_DESCRIPTION_MAX_LENGTH,
  CRITERION_NAME_MAX_LENGTH,
  criterionWeightsSumToOne,
  formatWeight,
  MAX_CRITERIA,
  MAX_PLACEMENT,
} from '@/lib/judging/limits';
import {
  normalizeWeights,
  overallScore,
  reliabilityMean,
} from '@/lib/judging/results';
import {
  MAX_TABLE_ROWS,
  TABLE_ALPHABETS,
  type TableLayout,
} from '@/lib/judging/table-label';
import {
  byTableSlot,
  eventHasVotes,
  getTableLabels,
  inPoolCondition,
  isParticipatingInEvent,
  JUDGE_IS_PARTICIPANT_MESSAGE,
  loadCriteria,
  loadResultsPool,
  loadTableLayout,
  normalizeJudgeEmail,
  replayEventVotes,
} from '@/lib/judging/server';
import { isPastSubmissionDeadline } from '@/lib/submissions';
import { hasPermission } from '@/lib/rbac/authorization';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import { writeAuditLog } from '@/utils/audit-log';
import { db } from '@/utils/db';

type JudgingPermission =
  | 'judging:manage:all'
  | 'judging:results:all'
  | 'judging:award:all';

/** The caller's id if they hold `permission`, else a failure to return. */
async function authorize(
  permission: JudgingPermission,
): Promise<{ userId: string } | { error: ActionResult<never> }> {
  const user = await getUser();
  if (!user) return { error: fail('Not authenticated') };
  if (!(await hasPermission(user.id, permission))) {
    return { error: fail('You do not have permission to do that.') };
  }
  return { userId: user.id };
}

async function revalidateJudging(eventId: string): Promise<void> {
  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/admin/events/${segment}/judging`);
    revalidatePath(`/dashboard/admin/events/${segment}/judging/results`);
  }
}

const STRUCTURE_LOCKED =
  'Judging has started. Criteria can no longer be added, removed or reordered — only renamed and reweighted.';

/** "Deleted judge #1a2b3c4d" — what's left once a judge deletes their account. */
function judgeLabel(row: {
  id: string;
  name: string | null;
  email: string | null;
}): string {
  return row.name || row.email || `Deleted judge #${row.id.slice(0, 8)}`;
}

/**
 * The event's roster in the order judges were added, as the Judging page and
 * the results' Judges tab both list it.
 *
 * - `startedJudging`: has a judge_state row, which only the judging screen
 *   creates, and only while judging is open.
 * - `signedIn`: the linked account has had a live, non-impersonated session
 *   since the row was added. A row linked at add time to an existing account
 *   doesn't count until then. Sessions go away on sign-out, so this can fall
 *   back to false later — it never claims a sign-in that didn't happen.
 */
async function loadRoster(eventId: string) {
  const rows = await db
    .select({
      id: eventJudges.id,
      email: eventJudges.email,
      userId: eventJudges.userId,
      name: authUser.name,
      disabledAt: eventJudges.disabledAt,
      inviteSentAt: eventJudges.inviteSentAt,
      startedJudging: sql<boolean>`EXISTS (SELECT 1 FROM ${judgeState} WHERE ${judgeState.judgeId} = ${eventJudges.id})`,
      signedIn: sql<boolean>`EXISTS (
        SELECT 1 FROM ${authSession}
         WHERE ${authSession.userId} = ${eventJudges.userId}
           AND ${authSession.impersonatedBy} IS NULL
           AND ${authSession.updatedAt} > ${eventJudges.createdAt}
      )`,
    })
    .from(eventJudges)
    .leftJoin(authUser, eq(authUser.id, eventJudges.userId))
    .where(eq(eventJudges.eventId, eventId))
    .orderBy(asc(eventJudges.createdAt));
  return rows.map((row) => ({ ...row, label: judgeLabel(row) }));
}

/**
 * Every comparison casts one vote per criterion, and the criteria are frozen
 * from the first vote on, so this division is exact.
 */
function comparisonsFromVotes(
  votes: number | undefined,
  criterionCount: number,
): number {
  return Math.round((votes ?? 0) / Math.max(criterionCount, 1));
}

// ── Overview for the Judging page ─────────────────────────────────────────

export type JudgingCriterionRow = {
  id: string;
  name: string;
  description: string;
  /** Fraction of the Overall score; the event's weights add up to 1. */
  weight: number;
};

export type JudgingRosterRow = {
  id: string;
  label: string;
  email: string | null;
  /** The invite email has gone out at least once. */
  invited: boolean;
  /** Signed in since being added; see `loadRoster`. */
  signedIn: boolean;
  /** Has opened the judging screen while judging was open. */
  startedJudging: boolean;
  /** The account behind the row was deleted. */
  deleted: boolean;
  disabled: boolean;
  comparisons: number;
};

export type JudgingProjectRow = {
  id: string;
  title: string;
  /** Sort key; null for a project that has never been published. */
  tableSlot: number | null;
  /** "B3", from the slot and the event's layout. */
  tableLabel: string | null;
  published: boolean;
  deactivated: boolean;
};

export type JudgingAdminData = {
  criteria: JudgingCriterionRow[];
  /**
   * A vote exists: criteria can't be added, removed or reordered, and the
   * table layout can't change under judges already walking the floor.
   */
  structureLocked: boolean;
  tableLayout: TableLayout;
  judges: JudgingRosterRow[];
  projects: JudgingProjectRow[];
};

/** Everything the Judging page shows. Requires judging:manage:all. */
export async function getJudgingAdmin(
  eventId: string,
): Promise<ActionResult<JudgingAdminData>> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const [
    criteria,
    structureLocked,
    judges,
    voteCounts,
    projects,
    tables,
    tableLayout,
  ] = await Promise.all([
    loadCriteria(eventId),
    eventHasVotes(eventId),
    loadRoster(eventId),
    db
      .select({ judgeId: judgingVotes.judgeId, votes: count() })
      .from(judgingVotes)
      .innerJoin(eventJudges, eq(eventJudges.id, judgingVotes.judgeId))
      .where(eq(eventJudges.eventId, eventId))
      .groupBy(judgingVotes.judgeId),
    db
      .select({
        id: submissions.id,
        title: submissions.title,
        published: submissions.published,
        deactivatedAt: submissions.deactivatedAt,
      })
      .from(submissions)
      .where(eq(submissions.eventId, eventId)),
    getTableLabels(eventId),
    loadTableLayout(eventId),
  ]);

  const votesByJudge = new Map(
    voteCounts.map((row) => [row.judgeId, row.votes]),
  );

  const weights = normalizeWeights(criteria.map((c) => c.weight));
  return ok({
    criteria: criteria.map(({ id, name, description }, index) => ({
      id,
      name,
      description,
      weight: weights[index],
    })),
    structureLocked,
    tableLayout,
    judges: judges.map((row) => ({
      id: row.id,
      label: row.label,
      email: row.email,
      invited: row.inviteSentAt != null,
      signedIn: row.signedIn,
      startedJudging: row.startedJudging,
      deleted: row.userId == null && row.email == null,
      disabled: row.disabledAt != null,
      comparisons: comparisonsFromVotes(
        votesByJudge.get(row.id),
        criteria.length,
      ),
    })),
    projects: projects
      .map((row) => ({
        id: row.id,
        title: row.title,
        tableSlot: tables.get(row.id)?.slot ?? null,
        tableLabel: tables.get(row.id)?.label ?? null,
        published: row.published,
        deactivated: row.deactivatedAt != null,
      }))
      .sort(byTableSlot),
  });
}

// ── Criteria ──────────────────────────────────────────────────────────────

const criterionSchema = z.object({
  /** Absent for a criterion added in this save. */
  id: z.uuid().optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Give every criterion a name.')
    .max(
      CRITERION_NAME_MAX_LENGTH,
      `Keep names under ${CRITERION_NAME_MAX_LENGTH} characters.`,
    ),
  description: z
    .string()
    .trim()
    .max(
      CRITERION_DESCRIPTION_MAX_LENGTH,
      `Keep descriptions to one line (under ${CRITERION_DESCRIPTION_MAX_LENGTH} characters).`,
    )
    .refine((value) => !/[\r\n]/.test(value), 'Keep descriptions to one line.'),
  weight: z
    .number({ error: 'Enter a weight for every criterion.' })
    .finite('Enter a weight for every criterion.')
    .min(0, 'Weights can’t be negative.')
    .max(1, 'Each weight is a fraction of 1, like 0.25.'),
});

const criteriaSchema = z
  .array(criterionSchema)
  .max(MAX_CRITERIA, `Keep it to ${MAX_CRITERIA} criteria or fewer.`)
  .superRefine((rows, ctx) => {
    const ids = rows.flatMap((row) => (row.id ? [row.id] : []));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Invalid criteria.' });
    }
    const weights = rows.map((row) => row.weight);
    if (rows.length > 0 && !criterionWeightsSumToOne(weights)) {
      const sum = weights.reduce((total, w) => total + w, 0);
      ctx.addIssue({
        code: 'custom',
        message: `Weights must add up to 1; these add up to ${formatWeight(sum)}.`,
      });
    }
  });

export type CriteriaInput = z.input<typeof criteriaSchema>;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input.';
}

/** Postgres foreign_key_violation, wherever the driver nests it. */
function isForeignKeyViolation(error: unknown): boolean {
  for (let e = error; e instanceof Error || (e && typeof e === 'object'); ) {
    if ((e as { code?: unknown }).code === '23503') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Saves the event's whole criteria list at once, in display order: rows with
 * an id update that criterion, rows without one are added, and criteria left
 * out are removed. Weights must add up to 1 and are stored rescaled to
 * exactly 1.
 *
 * Once any vote exists only names, descriptions and weights may change: the
 * list must name the same criteria in the same order. The event row lock
 * (FOR UPDATE here, FOR KEY SHARE in the vote path) keeps a first vote from
 * landing in between the "no votes yet" check and the change.
 */
export async function saveJudgingCriteria(
  eventId: string,
  input: CriteriaInput,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;
  const parsed = criteriaSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const rows = parsed.data;
  const weights = normalizeWeights(rows.map((row) => row.weight));

  let result: ActionResult<{ added: number; removed: string[] }>;
  try {
    result = await db.transaction(async (tx) => {
      const [event] = await tx
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, eventId))
        .for('update');
      if (!event) return fail('Event not found.');

      const existing = await loadCriteria(eventId, tx);
      const existingIds = new Set(existing.map((c) => c.id));
      if (rows.some((row) => row.id && !existingIds.has(row.id))) {
        return fail(
          'These criteria were changed elsewhere. Reload the page and try again.',
        );
      }
      const keptIds = new Set(rows.flatMap((row) => (row.id ? [row.id] : [])));
      const removed = existing
        .filter((c) => !keptIds.has(c.id))
        .map((c) => c.id);

      if (await eventHasVotes(eventId, tx)) {
        const sameList =
          rows.length === existing.length &&
          rows.every((row, index) => row.id === existing[index].id);
        if (!sameList) return fail(STRUCTURE_LOCKED);
      }

      if (removed.length > 0) {
        await tx
          .delete(judgingCriteria)
          .where(inArray(judgingCriteria.id, removed));
      }
      let added = 0;
      for (const [position, row] of rows.entries()) {
        const values = {
          name: row.name,
          description: row.description,
          weight: weights[position],
          position,
        };
        if (row.id) {
          await tx
            .update(judgingCriteria)
            .set(values)
            .where(eq(judgingCriteria.id, row.id));
        } else {
          await tx.insert(judgingCriteria).values({ eventId, ...values });
          added += 1;
        }
      }
      return ok({ added, removed });
    });
  } catch (error) {
    // The lock above should make this unreachable; a vote that slipped in
    // anyway must not surface as a 500.
    if (isForeignKeyViolation(error)) return fail(STRUCTURE_LOCKED);
    throw error;
  }
  if (!result.success) return result;

  await writeAuditLog({
    actorId: auth.userId,
    action: 'judging.criteria.updated',
    targetType: 'event',
    targetId: eventId,
    metadata: {
      criteria: rows.map((row, index) => ({
        id: row.id ?? null,
        name: row.name,
        weight: weights[index],
      })),
      added: result.data!.added,
      removed: result.data!.removed,
    },
  });
  await revalidateJudging(eventId);
  return ok();
}

// ── Roster ────────────────────────────────────────────────────────────────

const emailSchema = z.email('Enter a valid email address.');

/**
 * What became of one invite email. `cooling_down`: this address was sent a
 * sign-in link within the last minute (the cooldown the public sign-in form
 * shares), so nothing went out and the invite is still outstanding.
 */
export type JudgeInviteOutcome = 'sent' | 'failed' | 'cooling_down';

const INVITE_COOLING_DOWN =
  'A sign-in link went to this address in the last minute. Try again shortly.';

/**
 * Emails one judge their invite and records when it went out. `claimedAt`:
 * the caller already set `invite_sent_at` to it (to keep a concurrent bulk
 * send off the same judge); it's cleared again if nothing went out.
 */
async function deliverJudgeInvite(
  judge: { id: string; email: string },
  eventName: string,
  claimedAt?: Date,
): Promise<JudgeInviteOutcome> {
  const unclaim = async () => {
    if (!claimedAt) return;
    await db
      .update(eventJudges)
      .set({ inviteSentAt: null })
      .where(
        and(
          eq(eventJudges.id, judge.id),
          eq(eventJudges.inviteSentAt, claimedAt),
        ),
      );
  };

  if (!(await claimMagicLinkCooldown(judge.email))) {
    await unclaim();
    return 'cooling_down';
  }
  try {
    await sendJudgeInvite({ email: judge.email, eventName });
  } catch (error) {
    console.error('[deliverJudgeInvite] invite email failed', error);
    await releaseMagicLinkCooldown(judge.email);
    await unclaim();
    return 'failed';
  }
  if (!claimedAt) {
    await db
      .update(eventJudges)
      .set({ inviteSentAt: new Date() })
      .where(eq(eventJudges.id, judge.id));
  }
  return 'sent';
}

/** Claims an outstanding invite, so only one bulk send emails the judge. */
async function claimOutstandingInvite(judgeId: string): Promise<Date | null> {
  const claimedAt = new Date();
  const [claimed] = await db
    .update(eventJudges)
    .set({ inviteSentAt: claimedAt })
    .where(and(eq(eventJudges.id, judgeId), isNull(eventJudges.inviteSentAt)))
    .returning({ id: eventJudges.id });
  return claimed ? claimedAt : null;
}

/**
 * Adds a judge by email and, unless `sendInvite` is false, sends them a
 * "You're judging <event>" magic link. One left uninvited is picked up by
 * "Send outstanding invites". An address that already has an account is
 * linked straight away; a new one is linked when they first sign in. The
 * event's own participants can't judge it.
 */
export async function addEventJudge(
  eventId: string,
  email: string,
  { sendInvite = true }: { sendInvite?: boolean } = {},
): Promise<ActionResult<{ invite: JudgeInviteOutcome | 'not_sent' }>> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;
  const normalized = normalizeJudgeEmail(email);
  if (!emailSchema.safeParse(normalized).success) {
    return fail('Enter a valid email address.');
  }

  const [event] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return fail('Event not found.');

  const [existingUser] = await db
    .select({ id: authUser.id })
    .from(authUser)
    .where(sql`lower(${authUser.email}) = ${normalized}`)
    .limit(1);
  if (
    existingUser &&
    (await isParticipatingInEvent(eventId, existingUser.id))
  ) {
    return fail(JUDGE_IS_PARTICIPANT_MESSAGE);
  }

  const inserted = await db
    .insert(eventJudges)
    .values({ eventId, email: normalized })
    .onConflictDoNothing()
    .returning({ id: eventJudges.id });
  if (inserted.length === 0)
    return fail('That email is already on the roster.');
  const judgeId = inserted[0].id;

  if (existingUser) {
    // Skipped if this account is already on the roster under another address.
    await db
      .update(eventJudges)
      .set({ userId: existingUser.id })
      .where(
        and(
          eq(eventJudges.id, judgeId),
          sql`NOT EXISTS (SELECT 1 FROM ${eventJudges} other WHERE other.event_id = ${eventId} AND other.user_id = ${existingUser.id})`,
        ),
      );
  }

  const invite = sendInvite
    ? await deliverJudgeInvite({ id: judgeId, email: normalized }, event.name)
    : 'not_sent';

  await writeAuditLog({
    actorId: auth.userId,
    action: 'judging.judge.added',
    targetType: 'event_judge',
    targetId: judgeId,
    metadata: { eventId, email: normalized, invite },
  });
  await revalidateJudging(eventId);
  return ok({ invite });
}

/**
 * Sends the judge's invite again. Held to the per-address sign-in-link
 * cooldown and the organizer's invite rate limit.
 */
export async function resendJudgeInvite(
  eventId: string,
  judgeId: string,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;
  if (!(await checkJudgeInviteRateLimit(auth.userId))) {
    return fail(JUDGE_INVITE_RATE_LIMITED);
  }

  const [row] = await db
    .select({ email: eventJudges.email, eventName: events.name })
    .from(eventJudges)
    .innerJoin(events, eq(events.id, eventJudges.eventId))
    .where(and(eq(eventJudges.id, judgeId), eq(eventJudges.eventId, eventId)))
    .limit(1);
  if (!row) return fail('Judge not found.');
  if (!row.email) return fail('This judge deleted their account.');

  const outcome = await deliverJudgeInvite(
    { id: judgeId, email: row.email },
    row.eventName,
  );
  if (outcome === 'cooling_down') return fail(INVITE_COOLING_DOWN);
  if (outcome !== 'sent') return fail('Failed to send the invite.');

  await writeAuditLog({
    actorId: auth.userId,
    action: 'judging.judge.invite_resent',
    targetType: 'event_judge',
    targetId: judgeId,
    metadata: { eventId },
  });
  await revalidateJudging(eventId);
  return ok();
}

/** How many invites go out at once in a bulk send. */
const BULK_INVITE_CONCURRENCY = 5;

/**
 * Emails every judge who hasn't been invited yet: added without an invite,
 * or whose invite failed. Disabled judges and deleted accounts are left out.
 * One call counts once against the organizer's invite rate limit; each
 * address is still held to the sign-in-link cooldown, and one skipped for
 * it stays outstanding.
 */
export async function sendOutstandingJudgeInvites(
  eventId: string,
): Promise<ActionResult<{ sent: number; failed: number; skipped: number }>> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;
  if (!(await checkJudgeInviteRateLimit(auth.userId))) {
    return fail(JUDGE_INVITE_RATE_LIMITED);
  }

  const [event] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return fail('Event not found.');

  const outstanding = await db
    .select({ id: eventJudges.id, email: eventJudges.email })
    .from(eventJudges)
    .where(
      and(
        eq(eventJudges.eventId, eventId),
        isNull(eventJudges.inviteSentAt),
        isNull(eventJudges.disabledAt),
        isNotNull(eventJudges.email),
      ),
    )
    .orderBy(asc(eventJudges.createdAt));

  const sentIds: string[] = [];
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < outstanding.length; i += BULK_INVITE_CONCURRENCY) {
    const batch = outstanding.slice(i, i + BULK_INVITE_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (judge) => {
        const claimedAt = await claimOutstandingInvite(judge.id);
        // Another organizer's send got to them first.
        if (!claimedAt) return 'skipped' as const;
        return deliverJudgeInvite(
          { id: judge.id, email: judge.email! },
          event.name,
          claimedAt,
        );
      }),
    );
    outcomes.forEach((outcome, index) => {
      if (outcome === 'sent') sentIds.push(batch[index].id);
      else if (outcome === 'failed') failed += 1;
      else skipped += 1;
    });
  }

  if (outstanding.length > 0) {
    await writeAuditLog({
      actorId: auth.userId,
      action: 'judging.judge.invites_sent',
      targetType: 'event',
      targetId: eventId,
      metadata: { judgeIds: sentIds, failed, skipped },
    });
    await revalidateJudging(eventId);
  }
  return ok({ sent: sentIds.length, failed, skipped });
}

/**
 * Disables (or re-enables) a judge. A disabled judge is never dispatched
 * again; their votes still count, weighted by their reliability.
 */
export async function setEventJudgeDisabled(
  eventId: string,
  judgeId: string,
  disabled: boolean,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const [updated] = await db
    .update(eventJudges)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(and(eq(eventJudges.id, judgeId), eq(eventJudges.eventId, eventId)))
    .returning({ id: eventJudges.id });
  if (!updated) return fail('Judge not found.');

  await writeAuditLog({
    actorId: auth.userId,
    action: disabled ? 'judging.judge.disabled' : 'judging.judge.enabled',
    targetType: 'event_judge',
    targetId: judgeId,
    metadata: { eventId },
  });
  await revalidateJudging(eventId);
  return ok();
}

/** Removes a judge from the roster — only while they have cast no votes. */
export async function removeEventJudge(
  eventId: string,
  judgeId: string,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const result = await db.transaction(async (tx) => {
    const [judge] = await tx
      .select({ id: eventJudges.id })
      .from(eventJudges)
      .where(and(eq(eventJudges.id, judgeId), eq(eventJudges.eventId, eventId)))
      .for('update');
    if (!judge) return fail('Judge not found.');
    const [vote] = await tx
      .select({ id: judgingVotes.id })
      .from(judgingVotes)
      .where(eq(judgingVotes.judgeId, judgeId))
      .limit(1);
    if (vote) {
      return fail('This judge has already voted. Disable them instead.');
    }
    await tx.delete(eventJudges).where(eq(eventJudges.id, judgeId));
    return ok();
  });

  if (result.success) {
    await writeAuditLog({
      actorId: auth.userId,
      action: 'judging.judge.removed',
      targetType: 'event_judge',
      targetId: judgeId,
      metadata: { eventId },
    });
    await revalidateJudging(eventId);
  }
  return result;
}

// ── Table layout ──────────────────────────────────────────────────────────

const tableLayoutSchema = z.object({
  rows: z
    .number()
    .int('Enter a whole number of rows.')
    .min(1, 'There has to be at least one row.')
    .max(MAX_TABLE_ROWS, `At most ${MAX_TABLE_ROWS} rows.`),
  rowAlphabet: z.enum(TABLE_ALPHABETS),
  columnAlphabet: z.enum(TABLE_ALPHABETS),
});

/**
 * Sets how table slots are labelled on the expo floor. Re-labels every
 * table, so it's locked from the first vote on: judges already walking the
 * floor would otherwise be sent to tables that changed name under them.
 * Requires judging:manage:all.
 */
export async function updateJudgingTableLayout(
  eventId: string,
  input: TableLayout,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;
  const parsed = tableLayoutSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  if (await eventHasVotes(eventId)) {
    return fail(
      'Judging has started, so the table layout can no longer change.',
    );
  }
  const [updated] = await db
    .update(events)
    .set({
      judgingTableRows: parsed.data.rows,
      judgingTableRowAlphabet: parsed.data.rowAlphabet,
      judgingTableColumnAlphabet: parsed.data.columnAlphabet,
    })
    .where(eq(events.id, eventId))
    .returning({ id: events.id });
  if (!updated) return fail('Event not found.');

  await writeAuditLog({
    actorId: auth.userId,
    action: 'judging.table_layout.updated',
    targetType: 'event',
    targetId: eventId,
    metadata: parsed.data,
  });
  await revalidateJudging(eventId);
  return ok();
}

// ── Projects ──────────────────────────────────────────────────────────────

/**
 * Deactivates (or reactivates) a project: never dispatched again and left
 * out of results. Its votes are kept; its placement isn't, since a place
 * held by a project the results no longer list could never be cleared.
 */
export async function setSubmissionDeactivated(
  eventId: string,
  submissionId: string,
  deactivated: boolean,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const [updated] = await db
    .update(submissions)
    .set(
      deactivated
        ? { deactivatedAt: new Date(), placement: null }
        : { deactivatedAt: null },
    )
    .where(
      and(eq(submissions.id, submissionId), eq(submissions.eventId, eventId)),
    )
    .returning({ id: submissions.id });
  if (!updated) return fail('Project not found.');

  await writeAuditLog({
    actorId: auth.userId,
    action: deactivated
      ? 'judging.submission.deactivated'
      : 'judging.submission.reactivated',
    targetType: 'submission',
    targetId: submissionId,
    metadata: { eventId },
  });
  await revalidateJudging(eventId);
  return ok();
}

// ── Results & awards ──────────────────────────────────────────────────────

export type ResultsProjectRow = {
  id: string;
  title: string;
  tableSlot: number | null;
  tableLabel: string;
  placement: number | null;
  /** Weighted mean of per-criterion μ. Absent without judging:results:all. */
  score?: number;
};

type ResultsCriterionTable = {
  id: string;
  name: string;
  weight: number;
  rows: {
    id: string;
    title: string;
    tableSlot: number | null;
    tableLabel: string;
    mu: number;
    sigmaSq: number;
    comparisons: number;
  }[];
};

type ResultsJudgeRow = {
  id: string;
  label: string;
  disabled: boolean;
  /** In-pool comparisons that count toward results. */
  comparisons: number;
  /** criterion id → α / (α + β); the prior for a judge with no votes on it. */
  reliability: Record<string, number>;
};

export type JudgingResults = {
  canViewRankings: boolean;
  canAward: boolean;
  /** Before the submission deadline the pool can still change. */
  provisional: boolean;
  criteria: { id: string; name: string }[];
  /** By Overall score with rankings; by table without. */
  overall: ResultsProjectRow[];
  /** Empty without judging:results:all. */
  byCriterion: ResultsCriterionTable[];
  judges: ResultsJudgeRow[];
};

/**
 * The live results, recomputed on every call by replaying the in-pool votes.
 * Requires judging:results:all or judging:award:all; an award-only caller
 * gets the project list without any ranking, to record placements from.
 */
export async function getJudgingResults(
  eventId: string,
): Promise<ActionResult<JudgingResults>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  const [canViewRankings, canAward] = await Promise.all([
    hasPermission(user.id, 'judging:results:all'),
    hasPermission(user.id, 'judging:award:all'),
  ]);
  if (!canViewRankings && !canAward) {
    return fail('You do not have permission to view results.');
  }

  const [[event], criteria, pool, tables] = await Promise.all([
    db
      .select({ submissionsCloseAt: events.submissionsCloseAt })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1),
    loadCriteria(eventId),
    loadResultsPool(eventId),
    getTableLabels(eventId),
  ]);
  if (!event) return fail('Event not found.');

  const provisional = !isPastSubmissionDeadline(event.submissionsCloseAt);
  // In-pool projects are published, so they all have a table.
  const base = pool.map((project) => ({
    ...project,
    tableLabel: tables.get(project.id)?.label ?? '—',
  }));
  const byTable = byTableSlot;

  if (!canViewRankings) {
    return ok({
      canViewRankings,
      canAward,
      provisional,
      criteria: [],
      overall: base.sort(byTable),
      byCriterion: [],
      judges: [],
    });
  }

  const criterionIds = criteria.map((c) => c.id);
  const replay = await replayEventVotes(
    eventId,
    new Set(pool.map((p) => p.id)),
    criterionIds,
  );

  const overall = base
    .map((project) => ({
      ...project,
      score: overallScore(replay.byCriterion, criteria, project.id),
    }))
    .sort((a, b) => b.score - a.score || byTable(a, b));

  // Shares of the Overall score, so older events stored at 1 each read as
  // fractions like the rest.
  const weights = normalizeWeights(criteria.map((c) => c.weight));
  const byCriterion = criteria.map((criterion, index) => ({
    id: criterion.id,
    name: criterion.name,
    weight: weights[index],
    rows: base
      .map((project) => {
        const result = replay.byCriterion.get(criterion.id)!.get(project.id)!;
        return {
          id: project.id,
          title: project.title,
          tableSlot: project.tableSlot,
          tableLabel: project.tableLabel,
          ...result,
        };
      })
      .sort((a, b) => b.mu - a.mu || byTable(a, b)),
  }));

  const judges = (await loadRoster(eventId)).map((row) => {
    const reliability = replay.reliability.get(row.id);
    return {
      id: row.id,
      label: row.label,
      disabled: row.disabledAt != null,
      comparisons: comparisonsFromVotes(
        replay.votesByJudge.get(row.id),
        criteria.length,
      ),
      reliability: Object.fromEntries(
        criterionIds.map((id) => [
          id,
          reliabilityMean(reliability?.get(id) ?? JUDGE_PRIOR),
        ]),
      ),
    };
  });

  return ok({
    canViewRankings,
    canAward,
    provisional,
    criteria: criteria.map(({ id, name }) => ({ id, name })),
    overall,
    byCriterion,
    judges,
  });
}

/** A project that counts for results — the only ones that can be placed. */
async function findAwardableProject(eventId: string, submissionId: string) {
  const [row] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(submissions.eventId, eventId),
        inPoolCondition(),
      ),
    )
    .limit(1);
  return row ?? null;
}

const placementSchema = z
  .number()
  .int('Enter a whole number.')
  .min(1, 'Placements start at 1.')
  .max(MAX_PLACEMENT, `Placements go up to ${MAX_PLACEMENT}.`)
  .nullable();

/**
 * Records a project's overall placement (1st, 2nd, …), or clears it with
 * null. Each place is held by at most one project per event. Only projects
 * in the results can be placed, but clearing always works. Requires
 * judging:award:all.
 */
export async function setSubmissionPlacement(
  eventId: string,
  submissionId: string,
  placement: number | null,
): Promise<ActionResult> {
  const auth = await authorize('judging:award:all');
  if ('error' in auth) return auth.error;
  const parsed = placementSchema.safeParse(placement);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (
    parsed.data !== null &&
    !(await findAwardableProject(eventId, submissionId))
  ) {
    return fail('That project isn’t in the judging results.');
  }

  if (parsed.data !== null) {
    const [holder] = await db
      .select({ title: submissions.title })
      .from(submissions)
      .where(
        and(
          eq(submissions.eventId, eventId),
          eq(submissions.placement, parsed.data),
          sql`${submissions.id} <> ${submissionId}`,
        ),
      )
      .limit(1);
    if (holder) {
      return fail(`“${holder.title}” already holds place ${parsed.data}.`);
    }
  }

  try {
    const [updated] = await db
      .update(submissions)
      .set({ placement: parsed.data })
      .where(
        and(eq(submissions.id, submissionId), eq(submissions.eventId, eventId)),
      )
      .returning({ id: submissions.id });
    if (!updated) return fail('Project not found.');
  } catch (error) {
    // Lost a race for the same place: the partial unique index caught it.
    console.error('[setSubmissionPlacement] failed', error);
    return fail(`Another project already holds place ${parsed.data}.`);
  }
  await writeAuditLog({
    actorId: auth.userId,
    action: 'judging.submission.placement_set',
    targetType: 'submission',
    targetId: submissionId,
    metadata: { eventId, placement: parsed.data },
  });
  await revalidateJudging(eventId);
  return ok();
}
