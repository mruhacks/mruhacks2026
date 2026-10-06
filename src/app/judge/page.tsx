import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { LocalDateRange } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { listJudgeEventsForUser } from '@/lib/judging/server';

import { NotOnRoster, requireOnboardedJudge } from './judge-gate';

/** The events this person is judging. */
export default function JudgeHomePage() {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-32 animate-pulse rounded-xl' />}
    >
      <JudgeHome />
    </React.Suspense>
  );
}

async function JudgeHome() {
  const user = await requireOnboardedJudge('/judge');
  if (!user) return <NotOnRoster />;
  const judging = await listJudgeEventsForUser(user);

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <h1 className='text-2xl font-semibold'>Your events</h1>
        <p className='text-muted-foreground text-sm'>
          Open an event when the expo starts. The app will tell you which table
          to visit next.
        </p>
      </div>
      <ul className='flex flex-col gap-3'>
        {judging.map((event) => (
          <li key={event.eventId}>
            <Card className='relative flex-row items-center gap-3 p-4'>
              <div className='min-w-0 flex-1'>
                <Link
                  href={`/judge/${event.eventId}`}
                  className='font-medium after:absolute after:inset-0'
                >
                  {event.name}
                </Link>
                <p className='text-muted-foreground m-0 text-sm'>
                  <LocalDateRange start={event.startsAt} end={event.endsAt} />
                </p>
              </div>
              {event.disabled && <Badge variant='destructive'>Disabled</Badge>}
              <ChevronRight
                aria-hidden
                className='text-muted-foreground size-5'
              />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
