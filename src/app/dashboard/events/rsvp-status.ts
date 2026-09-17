/**
 * UI labels and badge variants for rsvp_statuses (pending, accepted,
 * declined, timed_out). The display config (title/description/variant/is_final)
 * lives in the rsvp_statuses table and is read on the server.
 */

import 'server-only';
import { cache } from 'react';

import { db } from '@/utils/db';
import { rsvpStatuses } from '@/db/schema';
import {
  type RsvpStatus,
  type ApplicationStatusBadgeVariant,
} from '@/types/lookups';
import { resolveStoredRsvpStatus } from '@/lib/rsvp/effective-rsvp-status';

export type RsvpStatusLabel = RsvpStatus;

export type RsvpStatusDisplay = {
  title: string;
  description: string;
  variant: ApplicationStatusBadgeVariant;
  isFinal: boolean;
};

export function resolveRsvpStatusKey(
  statusKey: string | null | undefined,
): RsvpStatusLabel {
  return resolveStoredRsvpStatus(statusKey);
}

/**
 * Reads all rsvp_statuses display rows and returns them keyed by label.
 * Cached per request so callers can resolve many statuses with one query.
 */
export const getRsvpStatusDisplayMap = cache(
  async (): Promise<Record<RsvpStatusLabel, RsvpStatusDisplay>> => {
    const rows = await db
      .select({
        label: rsvpStatuses.label,
        title: rsvpStatuses.title,
        description: rsvpStatuses.description,
        variant: rsvpStatuses.variant,
        isFinal: rsvpStatuses.isFinal,
      })
      .from(rsvpStatuses);

    const map = {} as Record<RsvpStatusLabel, RsvpStatusDisplay>;
    for (const row of rows) {
      map[resolveRsvpStatusKey(row.label)] = {
        title: row.title,
        description: row.description,
        variant: row.variant as ApplicationStatusBadgeVariant,
        isFinal: row.isFinal,
      };
    }
    return map;
  },
);

export async function getRsvpStatusDisplay(
  statusKey: RsvpStatusLabel | null | undefined,
): Promise<RsvpStatusDisplay> {
  const map = await getRsvpStatusDisplayMap();
  return map[resolveRsvpStatusKey(statusKey)];
}

export const RSVP_TIMELINE_LABELS = {
  respondBy: 'Respond by',
  respondedAt: 'Responded',
} as const;
