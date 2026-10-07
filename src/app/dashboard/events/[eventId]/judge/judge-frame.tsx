import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { Card, CardContent } from '@/components/ui/card';
import { events } from '@/db/schema';
import { resolveEventId } from '@/lib/events';
import { cn } from '@/lib/utils';
import { db } from '@/utils/db';

/** The event behind a judge URL segment, or a 404. */
export async function loadJudgeEvent(segment: string) {
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const [event] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) notFound();
  return { id: eventId, name: event.name };
}

/**
 * Chrome shared by the judge pages, inside the normal dashboard so judges
 * keep their nav, profile and events.
 */
export function JudgeFrame({
  segment,
  eventName,
  children,
}: {
  segment: string;
  eventName: string;
  children: React.ReactNode;
}) {
  return (
    <div className='mx-auto flex w-full max-w-2xl flex-col gap-2'>
      <BreadcrumbSegment id={segment} label={eventName} />
      {children}
    </div>
  );
}

/**
 * Every judge screen is one top-level card holding all of it, buttons
 * included — never cards inside cards. `help` pins to the top-left corner,
 * across from the notes button the "Go to" heading puts on the right.
 */
export function JudgeCard({
  className,
  help,
  children,
}: {
  className?: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className='gap-0 py-4'>
      <CardContent
        className={cn('relative flex flex-col gap-3 px-4 sm:px-5', className)}
      >
        {help && <div className='absolute -top-1 left-2 sm:left-3'>{help}</div>}
        {children}
      </CardContent>
    </Card>
  );
}
