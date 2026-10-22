import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import * as schema from '@/db/schema';
import { eventApplicationsCacheTag } from '@/lib/admin-event';
import { buildDietaryReport, type Report } from './report';
import * as Participation from '@/lib/participation/server';
import { listEventTreeIds, resolveEventRoot } from '@/lib/subevents';
import * as Wallet from '@/lib/wallet/server';
import { dietaryRestrictionsList, MEAL_EVENT_TYPE } from '@/types/lookups';
import { db } from '@/utils/db';

export async function loadDietaryReport(eventId: string): Promise<Report | null> {
  const root = await resolveEventRoot(eventId);
  if (!root) return null;

  const treeIds = await listEventTreeIds(root.id);

  const [participantRows, mealRows, checkInRows] = await Promise.all([
    db
      .select({
        userId: schema.user.id,
        accountName: schema.user.name,
        fullName: schema.userProfiles.fullName,
        otherText: schema.userProfiles.dietaryOtherText,
        restrictionLabels: sql<string[]>`ARRAY(
          SELECT ${schema.dietaryRestrictions.label}::text
          FROM ${schema.userDietaryRestrictions}
          INNER JOIN ${schema.dietaryRestrictions}
            ON ${schema.dietaryRestrictions.id} = ${schema.userDietaryRestrictions.restrictionId}
          WHERE ${schema.userDietaryRestrictions.userId} = ${schema.user.id}
        )`,
      })
      .from(schema.user)
      .innerJoin(
        schema.eventParticipants,
        and(
          eq(schema.eventParticipants.eventId, root.id),
          eq(schema.eventParticipants.userId, schema.user.id),
          Participation.hasStatus('accepted'),
        ),
      )
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.user.id)),
    db
      .select({
        id: schema.events.id,
        name: schema.events.name,
        startsAt: schema.events.startsAt,
        endsAt: schema.events.endsAt,
      })
      .from(schema.events)
      .innerJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.events.eventTypeId))
      .where(and(inArray(schema.events.id, treeIds), eq(schema.eventTypes.label, MEAL_EVENT_TYPE))),
    db
      .select({
        eventId: schema.checkIns.eventId,
        userId: schema.checkIns.userId,
        checkedInAt: schema.checkIns.checkedInAt,
      })
      .from(schema.checkIns)
      .where(inArray(schema.checkIns.eventId, treeIds)),
  ]);

  const participants = participantRows.map((row) => {
    const labels = new Set(row.restrictionLabels ?? []);
    return {
      userId: row.userId,
      name: Wallet.resolveParticipantName(row.fullName, row.accountName),
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
    .from(schema.eventParticipants)
    .where(and(eq(schema.eventParticipants.eventId, root.id), Participation.hasStatus('accepted')));

  return row?.c ?? 0;
}
