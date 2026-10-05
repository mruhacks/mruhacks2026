'use client';

import * as React from 'react';
import { ListFilter, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { StatusSplitStat } from '@/lib/application-stats';
import { STATIC_STATUS_DISPLAY } from '@/lib/participation/status';
import { participationStatusesList } from '@/types/lookups';
import { useStoredIdSet } from '@/lib/use-stored-id-set';

import { BarMeter } from './bar-meter';
import { BentoCard } from './bento-card';

/** One key per event, so hiding a stat here doesn't hide it elsewhere. */
function storageKey(eventId: string) {
  return `event-stats-hidden:${eventId}`;
}

/** Statuses left out of the counts — same per-event, per-browser scheme. */
function statusStorageKey(eventId: string) {
  return `event-stats-hidden-statuses:${eventId}`;
}

function statusTitle(status: string): string {
  if (status in STATIC_STATUS_DISPLAY) {
    return STATIC_STATUS_DISPLAY[status as keyof typeof STATIC_STATUS_DISPLAY]
      .title;
  }
  return status === 'unknown' ? 'Unknown' : status;
}

type MergedStat = {
  id: string;
  label: string;
  answered: number;
  buckets: {
    key: string;
    label: string;
    percent: number;
    inactive?: boolean;
  }[];
};

/**
 * Sums a status-split stat over the included statuses. Percentages are
 * recomputed against the summed respondents, so they mean the same thing as
 * an unfiltered card: share of the people counted who picked that option.
 */
function mergeStat(
  stat: StatusSplitStat,
  included: (status: string) => boolean,
): MergedStat {
  const sum = (counts: Record<string, number>) =>
    Object.entries(counts).reduce(
      (total, [status, count]) => (included(status) ? total + count : total),
      0,
    );
  const answered = sum(stat.answered);
  return {
    id: stat.id,
    label: stat.label,
    answered,
    buckets: stat.buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      inactive: bucket.inactive,
      percent: answered > 0 ? (sum(bucket.counts) / answered) * 100 : 0,
    })),
  };
}

export function QuestionStatsGrid({
  eventId,
  profile,
  questions,
  statusCounts,
}: {
  eventId: string;
  profile: StatusSplitStat[];
  questions: StatusSplitStat[];
  statusCounts: Record<string, number>;
}) {
  const { ids: hidden, toggle, clear } = useStoredIdSet(storageKey(eventId));
  const {
    ids: hiddenStatuses,
    toggle: toggleStatus,
    clear: clearStatuses,
  } = useStoredIdSet(statusStorageKey(eventId));

  // Both sets are null until the browser's value is known, and everything
  // renders (and counts) until then — that keeps the hydration render
  // identical to the server's, which never sees localStorage. Storing the
  // *hidden* ids (not the visible ones) also means a question or status
  // added later shows up by default instead of silently staying off.
  const isVisible = (stat: StatusSplitStat) => !hidden?.has(stat.id);
  const included = (status: string) => !hiddenStatuses?.has(status);

  // Every known status in lifecycle order, plus any stray one actually
  // present in the data, so nothing counted is missing from the filter.
  const statuses = [
    ...participationStatusesList,
    ...Object.keys(statusCounts).filter(
      (status) =>
        !(participationStatusesList as readonly string[]).includes(status) &&
        statusCounts[status] > 0,
    ),
  ];

  const all = [...profile, ...questions];
  const visibleCount = all.filter(isVisible).length;
  const hiddenCount = all.length - visibleCount;

  const totalApplicants = statuses.reduce(
    (total, status) => total + (statusCounts[status] ?? 0),
    0,
  );
  const includedApplicants = statuses.reduce(
    (total, status) =>
      included(status) ? total + (statusCounts[status] ?? 0) : total,
    0,
  );
  const includedStatusCount = statuses.filter(included).length;
  const isFiltered = includedStatusCount < statuses.length;

  const sections = [
    { title: 'Profile', stats: profile },
    { title: 'Application questions', stats: questions },
  ].filter((section) => section.stats.length > 0);

  const groups = sections
    .map((group) => ({
      title: group.title,
      stats: group.stats
        .filter(isVisible)
        .map((stat) => mergeStat(stat, included)),
    }))
    .filter((group) => group.stats.length > 0);

  return (
    <section className='space-y-4'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2
            className='m-0'
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--fw-semibold)',
              fontSize: '24px',
              letterSpacing: 'var(--track-display)',
            }}
          >
            Stats
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {isFiltered
              ? `Counting ${includedApplicants.toLocaleString()} of ${totalApplicants.toLocaleString()} applicants, by application status.`
              : 'How applicants filled in their profile and answered the application form.'}
          </p>
        </div>

        <div className='flex flex-wrap gap-2'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='sm'>
                <ListFilter aria-hidden className='size-4' />
                Filter
                {isFiltered && (
                  <span className='text-muted-foreground'>
                    ({includedStatusCount}/{statuses.length})
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-64'>
              <DropdownMenuLabel>Application status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {statuses.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={included(status)}
                  // Radix closes the menu on select; keeping it open lets an
                  // admin toggle several at once.
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => toggleStatus(status)}
                >
                  <span className='flex-1 truncate'>{statusTitle(status)}</span>
                  <span className='text-muted-foreground ml-2 text-xs tabular-nums'>
                    {(statusCounts[status] ?? 0).toLocaleString()}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
              {isFiltered && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => clearStatuses()}>
                    All statuses
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='sm'>
                <SlidersHorizontal aria-hidden className='size-4' />
                Choose stats
                {hiddenCount > 0 && (
                  <span className='text-muted-foreground'>
                    ({visibleCount}/{all.length})
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              className='max-h-96 w-64 overflow-y-auto'
            >
              {sections.map((group, index) => (
                <DropdownMenuGroup key={group.title}>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
                  {group.stats.map((stat) => (
                    <DropdownMenuCheckboxItem
                      key={stat.id}
                      checked={isVisible(stat)}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={() => toggle(stat.id)}
                    >
                      <span className='truncate'>{stat.label}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              ))}
              {hiddenCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => clear()}>
                    Show all
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          Every stat is hidden. Use “Choose stats” to bring some back.
        </p>
      ) : includedStatusCount === 0 ? (
        <p className='text-muted-foreground text-sm'>
          Every application status is filtered out. Use “Filter” to bring some
          back.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.title} className='space-y-3'>
            <h3 className='text-muted-foreground m-0 text-sm font-medium'>
              {group.title}
            </h3>
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
              {group.stats.map((stat) => (
                <BentoCard
                  key={stat.id}
                  title={stat.label}
                  description={`${stat.answered.toLocaleString()} ${
                    stat.answered === 1 ? 'response' : 'responses'
                  }`}
                >
                  {stat.answered === 0 ? (
                    <p className='text-muted-foreground text-sm'>
                      No responses yet.
                    </p>
                  ) : (
                    <div className='space-y-2.5'>
                      {stat.buckets.map((bucket) => (
                        <BarMeter
                          key={bucket.key}
                          label={bucket.label}
                          percent={bucket.percent}
                          inactive={bucket.inactive}
                        />
                      ))}
                    </div>
                  )}
                </BentoCard>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
