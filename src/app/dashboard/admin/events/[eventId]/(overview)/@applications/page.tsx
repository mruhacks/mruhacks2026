import * as React from 'react';
import { redirect } from 'next/navigation';

import {
  getApplicationsOverTime,
  getEventApplicationStats,
} from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { ApplicationsOverTimeChart } from '../../_components/applications-over-time-chart';
import { BentoCard, BentoCardSkeleton } from '../../_components/bento-card';

type Props = { params: Promise<{ eventId: string }> };

export default function ApplicationsCell({ params }: Props) {
  return (
    <React.Suspense fallback={<BentoCardSkeleton rows={4} />}>
      <ApplicationsSection paramsPromise={params} />
    </React.Suspense>
  );
}

/**
 * Display order and wording for the status pills. `null` is a submitted
 * application nobody has triaged yet — the DB models status as a single
 * nullable FK, so "no status row" is the un-reviewed state rather than a
 * separate stored value.
 */
const STATUS_ROWS = [
  { key: 'unknown', label: 'Submitted', dot: 'bg-muted-foreground' },
  { key: 'pending_review', label: 'In review', dot: 'bg-sky-500' },
  { key: 'approved', label: 'Accepted', dot: 'bg-emerald-500' },
  { key: 'waitlisted', label: 'Waitlisted', dot: 'bg-amber-500' },
  { key: 'denied', label: 'Declined', dot: 'bg-red-500' },
] as const;

async function ApplicationsSection({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) return null;
  const user = await getUser();
  if (!user) redirect('/signin');

  // Cohort numbers only — gated on the stats permission, which deliberately
  // does not grant access to any individual's answers.
  if (!(await hasPermission(user.id, 'application:stats'))) return null;

  const [stats, overTime] = await Promise.all([
    getEventApplicationStats(eventId),
    getApplicationsOverTime(eventId),
  ]);

  if (!stats || !stats.hasApplication) return null;

  const countByKey = new Map(
    stats.statusBreakdown.map((b) => [b.key, b.count]),
  );

  return (
    <BentoCard
      title='Applications over time'
      description={`${stats.total.toLocaleString()} ${
        stats.total === 1 ? 'application' : 'applications'
      } so far`}
    >
      <ApplicationsOverTimeChart
        data={overTime.map((point) => ({
          day: point.day.toISOString(),
          count: point.count,
          cumulative: point.cumulative,
        }))}
      />

      {/* Status as a single wrapping row of pills rather than a stacked
          list: it sits in the narrow column beside the description, where a
          five-row table would double the card's height for five numbers. */}
      <ul className='mt-4 flex list-none flex-wrap gap-2 border-t p-0 pt-4'>
        {STATUS_ROWS.map((row) => (
          <li
            key={row.key}
            className='bg-muted/50 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs'
          >
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${row.dot}`}
            />
            <span className='text-muted-foreground'>{row.label}</span>
            <span className='font-semibold tabular-nums'>
              {(countByKey.get(row.key) ?? 0).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </BentoCard>
  );
}
