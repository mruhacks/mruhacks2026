import 'server-only';

import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { cacheLife } from 'next/cache';

import { eventParticipants, participationStatuses } from '@/db/schema';
import { db } from '@/utils/db';
import {
  resolveStoredStatus,
  type StatusDisplay,
} from '@/lib/participation/status';
import type { ParticipationStatus, StatusBadgeVariant } from '@/types/lookups';

/**
 * The `participation_statuses.id` for a label, as an inline subquery — usable
 * in an insert's values, an update's set, or a where clause, so writers never
 * need a separate round trip (or a missing-row branch) to resolve an id.
 */
export function statusIdOf(label: ParticipationStatus): SQL<number> {
  return sql<number>`(SELECT ${participationStatuses.id} FROM ${participationStatuses} WHERE ${participationStatuses.label} = ${label})`;
}

/** `event_participants.status_id = <label>`, for where clauses. */
export function hasStatus(label: ParticipationStatus): SQL {
  return eq(eventParticipants.statusId, statusIdOf(label));
}

/** `event_participants.status_id` is any of `labels`, for where clauses. */
export function hasAnyStatus(labels: readonly ParticipationStatus[]): SQL {
  return inArray(
    eventParticipants.statusId,
    db
      .select({ id: participationStatuses.id })
      .from(participationStatuses)
      .where(inArray(participationStatuses.label, [...labels])),
  );
}

/**
 * Participants holding a spot (`accepted`) for `eventId`, as a scalar
 * subquery — selectable alongside a locked `events` row, so capacity is
 * measured inside the same statement that takes the lock. Bound by value
 * rather than correlated on a column: drizzle renders an outer column
 * unqualified inside `sql`, which would resolve against the inner table.
 */
export function attendingCountSql(eventId: string): SQL<number> {
  return sql<number>`(
    SELECT count(*)::int FROM ${eventParticipants}
    WHERE ${eventParticipants.eventId} = ${eventId}
      AND ${eventParticipants.statusId} = ${statusIdOf('accepted')}
  )`.mapWith(Number);
}

/** Number of participants holding a spot for one event. */
export async function countAttending(eventId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)`.mapWith(Number) })
    .from(eventParticipants)
    .where(and(eq(eventParticipants.eventId, eventId), hasStatus('accepted')));
  return row?.c ?? 0;
}

/**
 * Display config for every status, keyed by label. Fixed config that app
 * code never writes, so it's cached long-term rather than re-queried on
 * every render.
 */
export async function getStatusDisplayMap(): Promise<
  Record<ParticipationStatus, StatusDisplay>
> {
  'use cache';
  cacheLife('max');

  const rows = await db
    .select({
      label: participationStatuses.label,
      title: participationStatuses.title,
      description: participationStatuses.description,
      variant: participationStatuses.variant,
    })
    .from(participationStatuses);

  const map = {} as Record<ParticipationStatus, StatusDisplay>;
  for (const row of rows) {
    map[resolveStoredStatus(row.label)] = {
      title: row.title,
      description: row.description,
      variant: row.variant as StatusBadgeVariant,
    };
  }
  return map;
}
