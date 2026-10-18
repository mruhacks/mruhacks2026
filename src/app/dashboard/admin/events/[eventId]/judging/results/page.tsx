import * as React from 'react';
import { redirect } from 'next/navigation';

type Props = { params: Promise<{ eventId: string }> };

/** Every results table has its own route; the bare one opens Overall. */
export default function JudgingResultsRoute({ params }: Props) {
  return (
    <React.Suspense fallback={null}>
      <RedirectToOverall params={params} />
    </React.Suspense>
  );
}

async function RedirectToOverall({ params }: Props): Promise<React.ReactNode> {
  const { eventId } = await params;
  return redirect(`/dashboard/admin/events/${eventId}/judging/results/overall`);
}
