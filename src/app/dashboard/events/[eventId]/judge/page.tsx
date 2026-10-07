import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { events } from '@/db/schema';
import { resolveEventId } from '@/lib/events';
import { db } from '@/utils/db';

import { JudgeConsole } from './judge-console';

type Props = { params: Promise<{ eventId: string }> };

/** Session and DB reads stream in behind Suspense — see the event page. */
export const instant = false;

/**
 * The judge's screen during the expo, inside the normal dashboard so judges
 * keep their nav, profile and events. Roster membership is checked by the
 * actions themselves: everything after this is client-driven, each action
 * returning the next screen.
 */
export default function JudgePage({ params }: Props) {
  return (
    <Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <JudgeContent paramsPromise={params} />
    </Suspense>
  );
}

async function JudgeContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const [event] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) notFound();

  return (
    <div className='mx-auto w-full max-w-2xl'>
      <BreadcrumbSegment id={segment} label={event.name} />
      <JudgeConsole
        eventId={eventId}
        backHref={`/dashboard/events/${segment}`}
      />
    </div>
  );
}
