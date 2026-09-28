import * as React from 'react';
import { redirect } from 'next/navigation';

type Props = { params: Promise<{ eventId: string }> };

export default function Page({ params }: Props) {
  return (
    <React.Suspense fallback={null}>
      <RedirectToEvent params={params} />
    </React.Suspense>
  );
}

async function RedirectToEvent({ params }: Props): Promise<React.ReactNode> {
  const { eventId } = await params;
  return redirect(`/dashboard/admin/events/${eventId}`);
}
