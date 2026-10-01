import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { EventSchedule } from '@/app/dashboard/events/[eventId]/event-schedule';
import { getAdminEventHeader } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { serializeInstant } from '@/lib/datetime';
import { hasPermission } from '@/lib/rbac/authorization';
import {
  listSubevents,
  isScheduleVisible,
  getSubeventCheckInCounts,
} from '@/lib/subevents';
import { getUser } from '@/utils/auth';
import { BentoCardSkeleton } from '../../_components/bento-card';
import { SubeventList } from '../../subevents/subevent-list';

type Props = { params: Promise<{ eventId: string }> };

export default function ScheduleCell({ params }: Props) {
  return (
    <Suspense fallback={<BentoCardSkeleton rows={5} />}>
      <ScheduleSection params={params} />
    </Suspense>
  );
}

async function ScheduleSection({ params }: Props) {
  const { eventId: segment } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) return null;
  const user = await getUser();
  if (!user) redirect('/signin');
  const [event, entries, canManage, canCheckIn] = await Promise.all([
    getAdminEventHeader(eventId),
    listSubevents(eventId),
    hasPermission(user.id, 'event:manage'),
    hasPermission(user.id, 'checkin:write:all'),
  ]);
  if (!event) return null;
  if (canManage)
    return (
      <SubeventList
        fitContainer
        eventId={eventId}
        segment={segment}
        eventStartsAt={serializeInstant(event.startsAt)}
        subevents={entries}
        checkInEnabled={event.checkInEnabled}
        canCheckIn={canCheckIn}
        checkInCounts={
          canCheckIn && event.checkInEnabled
            ? await getSubeventCheckInCounts(entries.map((entry) => entry.id))
            : {}
        }
      />
    );
  return (
    <EventSchedule
      fitContainer
      entries={entries.filter(isScheduleVisible).map((entry) => ({
        ...entry,
        startsAt: serializeInstant(entry.startsAt!),
        endsAt: serializeInstant(entry.endsAt),
      }))}
    />
  );
}
