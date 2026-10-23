import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

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
import { eventApplicationsCacheTag } from '@/lib/admin-event';
import { buildDietaryReport, type DietaryReport } from '@/lib/dietary/report';
import { hasStatus } from '@/lib/participation/server';
import { listEventTreeIds, resolveEventRoot } from '@/lib/subevents';
import { resolveParticipantName } from '@/lib/wallet/participation';
import { dietaryRestrictionsList, MEAL_EVENT_TYPE } from '@/types/lookups';
import { db } from '@/utils/db';

export async function loadDietaryReport(eventId: string): Promise<DietaryReport | null> {
  const root = await resolveEventRoot(eventId);
  if (!root) return null;

  const treeIds = await listEventTreeIds(root.id);

  const [participantRows, mealRows, checkInRows] = await Promise.all([
    db
      .select({
        userId: user.id,
        accountName: user.name,
        fullName: userProfiles.fullName,
        otherText: userProfiles.dietaryOtherText,
        restrictionLabels: sql<string[]>`ARRAY(
          SELECT ${dietaryRestrictions.label}::text
          FROM ${userDietaryRestrictions}
          INNER JOIN ${dietaryRestrictions}
            ON ${dietaryRestrictions.id} = ${userDietaryRestrictions.restrictionId}
          WHERE ${userDietaryRestrictions.userId} = ${user.id}
        )`,
      })
      .from(user)
      .innerJoin(
        eventParticipants,
        and(eq(eventParticipants.eventId, root.id), eq(eventParticipants.userId, user.id), hasStatus('accepted')),
      )
      .leftJoin(userProfiles, eq(userProfiles.userId, user.id)),
    db
      .select({
        id: events.id,
        name: events.name,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
      })
      .from(events)
      .innerJoin(eventTypes, eq(eventTypes.id, events.eventTypeId))
      .where(and(inArray(events.id, treeIds), eq(eventTypes.label, MEAL_EVENT_TYPE))),
    db
      .select({
        eventId: checkIns.eventId,
        userId: checkIns.userId,
        checkedInAt: checkIns.checkedInAt,
      })
      .from(checkIns)
      .where(inArray(checkIns.eventId, treeIds)),
  ]);

  const participants = participantRows.map((row) => {
    const labels = new Set(row.restrictionLabels ?? []);
    return {
      userId: row.userId,
      name: resolveParticipantName(row.fullName, row.accountName),
      restrictions: dietaryRestrictionsList.filter((label) => labels.has(label)),
      otherText: labels.has('Other') ? row.otherText?.trim() || null : null,
    };
  });

  return buildDietaryReport({
    mainEventId: root.id,
    eventEndsAt: root.endsAt,
    participants,
    meals: mealRows.flatMap((row) =>
      row.startsAt
        ? [
            {
              id: row.id,
              name: row.name,
              startsAt: row.startsAt,
              endsAt: row.endsAt,
            },
          ]
        : [],
    ),
    checkIns: checkInRows,
    now: new Date(),
  });
}

export async function getDietaryExpectedCount(eventId: string): Promise<number> {
  'use cache';
  cacheTag(eventApplicationsCacheTag(eventId));
  cacheLife('minutes');

  const root = await resolveEventRoot(eventId);
  if (!root) return 0;
  if (root.id !== eventId) cacheTag(eventApplicationsCacheTag(root.id));

  const [row] = await db
    .select({ c: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(eventParticipants)
    .where(and(eq(eventParticipants.eventId, root.id), hasStatus('accepted')));

  return row?.c ?? 0;
}
