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
  rsvpStatusesList,
  type RsvpStatus,
  type ApplicationStatusBadgeVariant,
} from '@/types/lookups';

export type RsvpStatusLabel = RsvpStatus;

export const DEFAULT_RSVP_STATUS: RsvpStatusLabel = 'pending';

export type RsvpStatusDisplay = {
  title: string;
  description: string;
  variant: ApplicationStatusBadgeVariant;
  isFinal: boolean;
};

const VALID_RSVP_LABELS: readonly string[] = rsvpStatusesList;

/** Normalize DB label, null → pending. */
export function resolveRsvpStatusKey(
  statusKey: string | null | undefined,
): RsvpStatusLabel {
  if (statusKey && VALID_RSVP_LABELS.includes(statusKey)) {
    return statusKey as RsvpStatusLabel;
  }
  return DEFAULT_RSVP_STATUS;
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

/** Display config for a single RSVP status label, null → pending. */
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

type RsvpTimelineSource = {
  respondBy: Date | null;
  respondedAt: Date | null;
};

export const RSVP_TIMELINE_FIELDS = [
  {
    key: 'respondBy',
    label: RSVP_TIMELINE_LABELS.respondBy,
    getDate: (source: RsvpTimelineSource) => source.respondBy,
  },
  {
    key: 'respondedAt',
    label: RSVP_TIMELINE_LABELS.respondedAt,
    getDate: (source: RsvpTimelineSource) => source.respondedAt,
  },
] as const;
