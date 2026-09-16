'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  getEventDetails,
  getEventRsvpSummary,
} from '@/app/dashboard/admin/events/actions';
import type {
  AdminRsvpSummary,
  EventDetails,
} from '@/app/dashboard/admin/events/actions';
import { AdminRsvpOverviewCard } from '@/app/dashboard/admin/events/AdminRsvpOverviewCard';
import { RsvpSettingsCard } from '@/app/dashboard/admin/events/RsvpSettingsCard';
import { SendRsvpWaveCard } from '@/app/dashboard/admin/events/SendRsvpWaveCard';
import { useBreadcrumbSegment } from '@/components/breadcrumb-context';

type RsvpPageProps = {
  params: Promise<{ eventId: string }>;
};

export default function EventRsvpPage({ params }: RsvpPageProps) {
  const [eventId, setEventId] = React.useState<string | null>(null);
  const [event, setEvent] = React.useState<EventDetails | null>(null);
  const [rsvpSummary, setRsvpSummary] = React.useState<AdminRsvpSummary | null>(
    null,
  );
  const [rsvpSummaryError, setRsvpSummaryError] = React.useState<string | null>(
    null,
  );
  const [rsvpSummaryLoading, setRsvpSummaryLoading] = React.useState(false);
  const [rsvpReloadToken, setRsvpReloadToken] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  useBreadcrumbSegment(eventId, event?.name);

  React.useEffect(() => {
    params.then((p) => setEventId(p.eventId));
  }, [params]);

  React.useEffect(() => {
    if (!eventId) return;

    let cancelled = false;

    async function load() {
      const eventResult = await getEventDetails(eventId as string);
      if (cancelled) return;

      if (eventResult.success && eventResult.data) {
        setEvent(eventResult.data);
      } else if (!eventResult.success) {
        toast.error(eventResult.error || 'Failed to load event');
        setLoading(false);
        return;
      }
      setLoading(false);

      if (!eventResult.data?.hasApplication) {
        return;
      }

      setRsvpSummaryLoading(true);
      const summaryResult = await getEventRsvpSummary(eventId as string);
      if (cancelled) return;
      if (summaryResult.success && summaryResult.data) {
        setRsvpSummary(summaryResult.data);
        setRsvpSummaryError(null);
      } else if (!summaryResult.success) {
        setRsvpSummary(null);
        setRsvpSummaryError(
          summaryResult.error || 'Failed to load RSVP status',
        );
      }
      setRsvpSummaryLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId, rsvpReloadToken]);

  if (loading) {
    return (
      <div className='text-muted-foreground py-8 text-center'>Loading...</div>
    );
  }

  if (!event) {
    return (
      <div className='text-destructive py-8 text-center'>Event not found</div>
    );
  }

  if (!event.hasApplication) {
    return (
      <div className='flex flex-col gap-2'>
        <h2 className='text-lg font-semibold'>RSVP</h2>
        <p className='text-muted-foreground text-sm'>
          RSVP waves are available when this event requires an application form.
        </p>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-6'>
      <h2 className='text-lg font-semibold'>RSVP</h2>

      <AdminRsvpOverviewCard
        summary={rsvpSummary}
        loading={rsvpSummaryLoading}
        error={rsvpSummaryError}
      />

      <RsvpSettingsCard
        eventId={event.id}
        rsvpResponseWindowHours={event.rsvpResponseWindowHours}
        onSaved={(hours) => {
          setEvent((current) =>
            current ? { ...current, rsvpResponseWindowHours: hours } : current,
          );
        }}
      />

      <SendRsvpWaveCard
        eventId={event.id}
        hasApplication={event.hasApplication}
        rsvpResponseWindowHours={event.rsvpResponseWindowHours}
        onWaveSent={() => setRsvpReloadToken((token) => token + 1)}
      />
    </div>
  );
}
