import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { getAdminEventSettings } from '@/lib/admin-event';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { EventSettingsForm } from './event-settings-form';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Sync shell so this segment still contributes to the route's App Shell —
 * the same reason the event layout above it has no top-level await.
 */
export default function EventSettingsPage({ params }: Props) {
  return (
    <React.Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent paramsPromise={params} />
    </React.Suspense>
  );
}

function SettingsSkeleton() {
  return <div className='bg-muted h-96 animate-pulse rounded-xl' />;
}

async function SettingsContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId } = await paramsPromise;
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'event:manage:all');

  const event = await getAdminEventSettings(eventId);
  if (!event) notFound();

  // Just the settings form. The description is authored in place on the
  // event dashboard's Description card, so editing it here too would be two
  // sources of truth for the same field.
  return <EventSettingsForm event={event} />;
}
