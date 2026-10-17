'use server';

import { and, eq, isNull, or } from 'drizzle-orm';

import {
  checkIns,
  dietaryRestrictions,
  eventParticipants,
  events,
  eventTypes,
  user,
  userDietaryRestrictions,
  userProfiles,
} from '@/db/schema';
import { buildDietaryReport, type DietaryReport } from '@/lib/dietary/report';
import { hasStatus } from '@/lib/participation/server';
import { requirePermission } from '@/lib/rbac/authorization';
import { resolveParticipantName } from '@/lib/wallet/participation';
import { dietaryRestrictionsList } from '@/types/lookups';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadReport(eventId: string): Promise<DietaryReport | null> {
  const [event] = await db
    .select({ endsAt: events.endsAt })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.parentEventId)))
    .limit(1);
  if (!event) return null;

  const [participantRows, restrictionRows, mealRows, checkInRows] =
    await Promise.all([
      db
        .select({
          userId: user.id,
          accountName: user.name,
          fullName: userProfiles.fullName,
          otherText: userProfiles.dietaryOtherText,
        })
        .from(user)
        .innerJoin(
          eventParticipants,
          and(
            eq(eventParticipants.eventId, eventId),
            eq(eventParticipants.userId, user.id),
            hasStatus('accepted'),
          ),
        )
        .leftJoin(userProfiles, eq(userProfiles.userId, user.id)),
      db
        .select({
          userId: userDietaryRestrictions.userId,
          label: dietaryRestrictions.label,
        })
        .from(userDietaryRestrictions)
        .innerJoin(
          dietaryRestrictions,
          eq(dietaryRestrictions.id, userDietaryRestrictions.restrictionId),
        )
        .innerJoin(
          eventParticipants,
          and(
            eq(eventParticipants.eventId, eventId),
            eq(eventParticipants.userId, userDietaryRestrictions.userId),
            hasStatus('accepted'),
          ),
        ),
      db
        .select({ id: events.id, name: events.name, startsAt: events.startsAt })
        .from(events)
        .innerJoin(eventTypes, eq(eventTypes.id, events.eventTypeId))
        .where(
          and(eq(events.parentEventId, eventId), eq(eventTypes.label, 'meal')),
        ),
      db
        .select({
          eventId: checkIns.eventId,
          userId: checkIns.userId,
          checkedInAt: checkIns.checkedInAt,
        })
        .from(checkIns)
        .innerJoin(events, eq(events.id, checkIns.eventId))
        .where(or(eq(events.id, eventId), eq(events.parentEventId, eventId))),
    ]);

  const byUser = new Map<string, Set<string>>();
  for (const row of restrictionRows) {
    const labels = byUser.get(row.userId);
    if (labels) labels.add(row.label);
    else byUser.set(row.userId, new Set([row.label]));
  }

  const participants = participantRows.map((row) => {
    const labels = byUser.get(row.userId);
    return {
      userId: row.userId,
      name: resolveParticipantName(row.fullName, row.accountName),
      restrictions: dietaryRestrictionsList.filter((label) =>
        labels?.has(label),
      ),
      otherText: labels?.has('Other') ? row.otherText?.trim() || null : null,
    };
  });

  return buildDietaryReport({
    mainEventId: eventId,
    eventEndsAt: event.endsAt,
    participants,
    meals: mealRows.flatMap((row) =>
      row.startsAt
        ? [{ id: row.id, name: row.name, startsAt: row.startsAt }]
        : [],
    ),
    checkIns: checkInRows,
    now: new Date(),
  });
}

export async function getDietaryReport(
  eventId: string,
): Promise<ActionResult<DietaryReport>> {
  const actor = await getUser();
  if (!actor) return fail('Not authenticated');
  await requirePermission(actor.id, 'dietary:read:all');
  if (!UUID_PATTERN.test(eventId)) return fail('Event not found.');

  const report = await loadReport(eventId);
  if (!report) {
    return fail('Only main events have a dietary report.');
  }

  return ok(report);
}
