import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { eq } from 'drizzle-orm';

import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { Button } from '@/components/ui/button';
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
 * keep their nav, profile and events: a way back to the event on the left,
 * and an optional `action` on the right.
 */
export function JudgeFrame({
  segment,
  eventName,
  action,
  children,
}: {
  segment: string;
  eventName: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className='mx-auto flex w-full max-w-2xl flex-col gap-2'>
      <BreadcrumbSegment id={segment} label={eventName} />
      <div className='flex items-center justify-between'>
        {/* The header's breadcrumbs are hidden on phones, so this is the way
            back out there. */}
        <Button
          asChild
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-2 w-fit'
        >
          <Link href={`/dashboard/events/${segment}`}>
            <ArrowLeft data-icon='inline-start' />
            Back to event
          </Link>
        </Button>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * Every judge screen is one top-level card holding all of it, buttons
 * included — never cards inside cards.
 */
export function JudgeCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className='gap-0 py-4'>
      <CardContent
        className={cn('flex flex-col gap-3 px-4 sm:px-5', className)}
      >
        {children}
      </CardContent>
    </Card>
  );
}
