import { ScheduleDayGroups } from '@/components/schedule-day-groups';
import { MapPin } from 'lucide-react';
import { LocalDateRange } from '@/components/local-date-time';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { ScheduleViewport } from '@/components/schedule-viewport';
import { ScheduleCard } from '@/components/schedule-card';

export type ScheduleEntry = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  descriptionMarkdown: string | null;
};

export function EventSchedule({
  entries,
  fitContainer = false,
}: {
  entries: ScheduleEntry[];
  fitContainer?: boolean;
}) {
  if (entries.length === 0) return null;
  const schedule = (
    <ScheduleDayGroups
      listClassName='divide-y'
      entries={entries.map((entry) => ({
        id: entry.id,
        startsAt: entry.startsAt,
        content: (
          <li
            key={entry.id}
            data-schedule-entry={entry.id}
            className='flex flex-col gap-2 px-4 py-3'
          >
            <p className='font-medium'>{entry.name}</p>
            <p className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
              <LocalDateRange
                start={entry.startsAt}
                end={entry.endsAt}
                timeOnly
              />
              {entry.location && (
                <span className='inline-flex items-center gap-1.5'>
                  <MapPin aria-hidden className='size-3.5 shrink-0' />
                  {entry.location}
                </span>
              )}
            </p>
            {entry.descriptionMarkdown && (
              <MarkdownContent markdown={entry.descriptionMarkdown} />
            )}
          </li>
        ),
      }))}
    />
  );
  return (
    <ScheduleCard fitContainer={fitContainer}>
      <ScheduleViewport entries={entries} fitContainer={fitContainer}>
        {schedule}
      </ScheduleViewport>
    </ScheduleCard>
  );
}
