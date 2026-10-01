'use client';

import type { ReactNode } from 'react';
import {
  LocalDateTime,
  useDisplayTimeZone,
} from '@/components/local-date-time';
import { groupScheduleByDay } from '@/lib/schedule';

export function ScheduleDayGroups({
  entries,
  listClassName,
}: {
  entries: { id: string; startsAt: string | null; content: ReactNode }[];
  listClassName?: string;
}) {
  const timeZone = useDisplayTimeZone();
  const days = groupScheduleByDay(entries, timeZone);

  return (
    <div className='flex flex-col'>
      {days.map((day) => (
        <section key={day.key} className='flex flex-col'>
          <h3 className='bg-muted text-muted-foreground sticky top-0 border-b px-4 py-3 text-sm font-medium'>
            {day.entries[0].startsAt ? (
              <LocalDateTime value={day.entries[0].startsAt} weekday='long' />
            ) : (
              'Date TBA'
            )}
          </h3>
          <ul className={listClassName}>
            {day.entries.map((entry) => entry.content)}
          </ul>
        </section>
      ))}
    </div>
  );
}
