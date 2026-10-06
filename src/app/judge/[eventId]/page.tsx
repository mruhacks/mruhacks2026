import * as React from 'react';
import { notFound } from 'next/navigation';

import { resolveEventId } from '@/lib/events';

import { NotOnRoster, requireOnboardedJudge } from '../judge-gate';
import { JudgeConsole } from './judge-console';

type Props = { params: Promise<{ eventId: string }> };

/**
 * The judge's phone screen during the expo. Everything after the gate is
 * client-driven: each action returns the next screen.
 */
export default function JudgeEventPage({ params }: Props) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-64 animate-pulse rounded-xl' />}
    >
      <JudgeEvent paramsPromise={params} />
    </React.Suspense>
  );
}

async function JudgeEvent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await requireOnboardedJudge(`/judge/${segment}`);
  if (!user) return <NotOnRoster />;
  return <JudgeConsole eventId={eventId} />;
}
