import 'server-only';

import { and, asc, count, eq, exists, inArray, not, or, sql, type SQL } from 'drizzle-orm';

import {
  checkIns,
  eventInvitations,
  eventParticipants,
  eventRsvpWaves,
  marketingConsents,
  participationStatuses,
  teamMembers,
  user,
  userRole,
  type CampaignType,
} from '@/db/schema';
import { db } from '@/utils/db';
import { isAudienceGroup, type AudienceRule, type AudienceRuleGroup } from './audience-rules';

/**
 * Compiles a validated audience rule tree (`@/lib/campaigns/audience-rules`)
 * into a Drizzle condition on `"user".id`, built only from `EXISTS` / `NOT
 * EXISTS` subqueries with bound parameters. Nothing from the tree is ever
 * interpolated as SQL text.
 *
 * Callers must validate with `audienceRulesSchema` first; this module trusts
 * the tree's shape but not its intent, which is why the forced conditions
 * live here rather than in the builder.
 */

export type AudienceContext = {
  type: CampaignType;
  /** Required for operational campaigns; their audience never leaves this event's participants. */
  eventId: string | null;
};

const TRUE = sql`true`;
const FALSE = sql`false`;

function participatedIn(value: Extract<AudienceRule, { field: 'participatedIn' }>['value']): SQL {
  const statuses = value.statuses ?? [];
  if (statuses.length === 0) {
    return exists(
      db
        .select({ one: sql`1` })
        .from(eventParticipants)
        .where(and(eq(eventParticipants.userId, user.id), eq(eventParticipants.eventId, value.eventId))),
    );
  }

  // The *effective* status: a stored `invited` past its deadline reads as
  // `timed_out`, exactly as `resolveEffectiveStatus` does for every other read.
  const effectiveStatus = sql<string>`CASE
    WHEN ${participationStatuses.label} = 'invited'
     AND ${eventRsvpWaves.respondBy} < now()
    THEN 'timed_out'
    ELSE ${participationStatuses.label}
  END`;

  return exists(
    db
      .select({ one: sql`1` })
      .from(eventParticipants)
      .innerJoin(participationStatuses, eq(eventParticipants.statusId, participationStatuses.id))
      .leftJoin(eventInvitations, eq(eventInvitations.participantId, eventParticipants.id))
      .leftJoin(eventRsvpWaves, eq(eventInvitations.rsvpWaveId, eventRsvpWaves.id))
      .where(
        and(
          eq(eventParticipants.userId, user.id),
          eq(eventParticipants.eventId, value.eventId),
          inArray(effectiveStatus, statuses),
        ),
      ),
  );
}

function optedIntoMarketing(): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(marketingConsents)
      .where(and(eq(marketingConsents.userId, user.id), eq(marketingConsents.optedIn, true))),
  );
}

function compileRule(rule: AudienceRule): SQL {
  let condition: SQL;
  switch (rule.field) {
    case 'participatedIn':
      condition = participatedIn(rule.value);
      break;
    case 'checkedIn':
      condition = exists(
        db
          .select({ one: sql`1` })
          .from(checkIns)
          .where(and(eq(checkIns.userId, user.id), eq(checkIns.eventId, rule.value.eventId))),
      );
      break;
    case 'onTeam':
      condition = exists(
        db
          .select({ one: sql`1` })
          .from(teamMembers)
          .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.eventId, rule.value.eventId))),
      );
      break;
    case 'marketingConsent':
      // No consent row means never opted in.
      condition = rule.value.optedIn ? optedIntoMarketing() : not(optedIntoMarketing());
      break;
    case 'hasRole':
      condition = exists(
        db
          .select({ one: sql`1` })
          .from(userRole)
          .where(and(eq(userRole.userId, user.id), eq(userRole.roleId, rule.value.roleId))),
      );
      break;
  }
  return rule.operator === '!=' ? not(condition) : condition;
}

function compileGroup(group: AudienceRuleGroup): SQL {
  const parts = group.rules.map((node) => (isAudienceGroup(node) ? compileGroup(node) : compileRule(node)));
  // An empty group places no constraint, matching react-querybuilder.
  const combined =
    parts.length === 0 ? TRUE : group.combinator === 'or' ? (or(...parts) ?? FALSE) : (and(...parts) ?? TRUE);
  return group.not ? not(combined) : combined;
}

/**
 * The conditions the builder can't remove, whatever the tree says:
 * marketing email only reaches users who opted in, and operational email
 * only reaches the participants of its event (CASL).
 */
function forcedConditions(context: AudienceContext): SQL {
  if (context.type === 'marketing') return optedIntoMarketing();
  if (!context.eventId) {
    throw new Error('Operational campaigns need an event context');
  }
  return participatedIn({ eventId: context.eventId });
}

/** Only accounts that can actually receive email. */
const deliverable = and(eq(user.emailVerified, true), sql`coalesce(${user.banned}, false) = false`)!;

/** The full `WHERE` for an audience, forced conditions included. */
function compileAudience(tree: AudienceRuleGroup, context: AudienceContext): SQL {
  return and(deliverable, forcedConditions(context), compileGroup(tree))!;
}

/** How many users the audience currently resolves to. Unique by user id. */
export async function countAudience(tree: AudienceRuleGroup, context: AudienceContext): Promise<number> {
  const [row] = await db.select({ c: count() }).from(user).where(compileAudience(tree, context));
  return Number(row?.c ?? 0);
}

export type AudienceMember = { id: string; name: string; email: string };

/** Up to `limit` members of the audience, alphabetically, for the preview list. */
export async function sampleAudience(
  tree: AudienceRuleGroup,
  context: AudienceContext,
  limit: number,
): Promise<AudienceMember[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(compileAudience(tree, context))
    .orderBy(asc(user.name), asc(user.id))
    .limit(limit);
}

/** Every member of the audience, for dispatch. */
export async function resolveAudience(tree: AudienceRuleGroup, context: AudienceContext): Promise<AudienceMember[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(compileAudience(tree, context))
    .orderBy(asc(user.id));
}
