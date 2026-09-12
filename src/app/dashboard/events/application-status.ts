/**
 * UI labels and badge variants for application_statuses (pending_review, approved,
 * denied, waitlisted). The display config (title/description/variant/is_final)
 * lives in the application_statuses table and is read on the server.
 */

import 'server-only';
import { cacheLife } from 'next/cache';

import { db } from '@/utils/db';
import { applicationStatuses } from '@/db/schema';
import {
  applicationStatusesList,
  type ApplicationStatus,
  type ApplicationStatusBadgeVariant,
} from '@/types/lookups';

export type ApplicationStatusLabel = ApplicationStatus;
export type { ApplicationStatusBadgeVariant };

const DEFAULT_APPLICATION_STATUS: ApplicationStatusLabel = 'pending_review';

export type ApplicationStatusDisplay = {
  title: string;
  description: string;
  variant: ApplicationStatusBadgeVariant;
  isFinal: boolean;
};

const VALID_STATUS_LABELS: readonly string[] = applicationStatusesList;

/** Normalize DB label, null -> pending_review. */
export function resolveApplicationStatusKey(
  statusKey: string | null | undefined,
): ApplicationStatusLabel {
  if (statusKey && VALID_STATUS_LABELS.includes(statusKey)) {
    return statusKey as ApplicationStatusLabel;
  }
  return DEFAULT_APPLICATION_STATUS;
}

/**
 * Reads all application_statuses display rows and returns them keyed by
 * label. This is fixed display config (title/description/badge variant),
 * never written by app code, so it's cached long-term rather than re-queried
 * on every render.
 */
export async function getApplicationStatusDisplayMap(): Promise<
  Record<ApplicationStatusLabel, ApplicationStatusDisplay>
> {
  'use cache';
  cacheLife('max');

  const rows = await db
    .select({
      label: applicationStatuses.label,
      title: applicationStatuses.title,
      description: applicationStatuses.description,
      variant: applicationStatuses.variant,
      isFinal: applicationStatuses.isFinal,
    })
    .from(applicationStatuses);

  const map = {} as Record<ApplicationStatusLabel, ApplicationStatusDisplay>;
  for (const row of rows) {
    map[resolveApplicationStatusKey(row.label)] = {
      title: row.title,
      description: row.description,
      variant: row.variant as ApplicationStatusBadgeVariant,
      isFinal: row.isFinal,
    };
  }
  return map;
}

/** Display config for a single status label, null -> pending_review. */
export async function getApplicationStatusDisplay(
  statusKey: ApplicationStatusLabel | null | undefined,
): Promise<ApplicationStatusDisplay> {
  const map = await getApplicationStatusDisplayMap();
  return map[resolveApplicationStatusKey(statusKey)];
}

/** Labels for application timeline fields shown in the status banner. */
export const APPLICATION_TIMELINE_LABELS = {
  submitted: 'Submitted',
  decisionMade: 'Decision made',
} as const;

type ApplicationTimelineSource = {
  createdAt: Date;
  reviewedAt: Date | null;
};

/** Timeline fields rendered in the status card (label + date source). */
export const APPLICATION_TIMELINE_FIELDS = [
  {
    key: 'submitted',
    label: APPLICATION_TIMELINE_LABELS.submitted,
    getDate: (source: ApplicationTimelineSource) => source.createdAt,
  },
  {
    key: 'decisionMade',
    label: APPLICATION_TIMELINE_LABELS.decisionMade,
    getDate: (source: ApplicationTimelineSource) => source.reviewedAt,
  },
] as const;
