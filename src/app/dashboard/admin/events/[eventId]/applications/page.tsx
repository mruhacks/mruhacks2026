import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import {
  getAdminEventHeader,
  getApplicationRoster,
  getEventAttendeeRoster,
  getEventQuestions,
} from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { ApplicationsTable } from '../_components/applications-table';
import { AttendeesTable } from '../_components/attendees-table';

type Props = { params: Promise<{ eventId: string }> };

/**
 * The full applications roster, reached from the Applications tile on the
 * event dashboard.
 *
 * It lives on its own page rather than in a dashboard cell because it is by
 * far the heaviest thing on the route — one row per applicant, with a column
 * per question — and an admin passing through to check-in has no reason to
 * pay for it.
 *
 * Sync shell so the segment keeps its static shell; see `questions/page.tsx`.
 */
export default function ApplicationsPage({ params }: Props) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <ApplicationsContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function ApplicationsContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');

  // Individual applicants and their answers — a strictly stronger permission
  // than the dashboard's cohort statistics.
  await requirePermission(user.id, 'application:read:all');

  const event = await getAdminEventHeader(eventId);
  if (!event) return null;

  // An event without an application form has signups, not applications.
  if (!event.hasApplication) {
    const attendees = await getEventAttendeeRoster(eventId);
    return (
      <div className='space-y-4'>
        <div>
          <h2 className='text-lg font-semibold'>Registered attendees</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {attendees.length.toLocaleString()} registered
          </p>
        </div>
        <AttendeesTable rows={attendees} />
      </div>
    );
  }

  const [rows, questions] = await Promise.all([
    getApplicationRoster(eventId),
    getEventQuestions(eventId),
  ]);

  return (
    <div className='space-y-4'>
      <div>
        <h2 className='text-lg font-semibold'>All applications</h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {rows.length.toLocaleString()}{' '}
          {rows.length === 1 ? 'application' : 'applications'} submitted.
        </p>
      </div>
      <ApplicationsTable eventId={eventId} rows={rows} questions={questions} />
    </div>
  );
}
