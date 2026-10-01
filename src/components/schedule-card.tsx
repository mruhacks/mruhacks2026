import type { ReactNode } from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function ScheduleCard({
  children,
  action,
  fitContainer = false,
}: {
  children: ReactNode;
  action?: ReactNode;
  fitContainer?: boolean;
}) {
  return (
    <section
      aria-labelledby='event-schedule-heading'
      className={cn(
        'flex min-w-0 flex-col gap-4',
        fitContainer && 'lg:h-full lg:min-h-0',
      )}
    >
      <div className='flex shrink-0 items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <CalendarClock aria-hidden className='size-4' />
          <h2 id='event-schedule-heading' className='text-xl font-semibold'>
            Schedule
          </h2>
        </div>
        {action}
      </div>
      <Card
        className={cn(
          'overflow-hidden py-0',
          fitContainer && 'lg:min-h-0 lg:flex-1',
        )}
      >
        <CardContent
          className={cn(
            'p-0',
            fitContainer && 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col',
          )}
        >
          {children}
        </CardContent>
      </Card>
    </section>
  );
}
