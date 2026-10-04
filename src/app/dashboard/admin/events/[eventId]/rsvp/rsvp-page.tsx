'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  getEventDetails,
  getEventRsvpSummary,
  getEventWaitlist,
} from '@/app/dashboard/admin/events/actions';
import type {
  AdminRsvpSummary,
  EventDetails,
  WaitlistEntry,
} from '@/app/dashboard/admin/events/actions';
import { AdminRsvpOverviewCard } from '@/app/dashboard/admin/events/AdminRsvpOverviewCard';
import { RsvpSettingsCard } from '@/app/dashboard/admin/events/RsvpSettingsCard';
import { RsvpWavesCard } from '@/app/dashboard/admin/events/RsvpWavesCard';

/**
 * Takes the event's uuid rather than the route's `params`: the `[eventId]`
 * segment may be the event's custom slug, and `page.tsx` resolves it on the
 * server so the RSVP actions are keyed by the stored id.
 *
 * No breadcrumb registration here — the event layout above already maps this
 * segment to the event's name.
 */
export function EventRsvpPage({
  eventId,
  canManageRsvp,
}: {
  eventId: string;
  /** Viewer holds `rsvp:write:all`: may close an open wave early. */
  canManageRsvp: boolean;
}) {
  const [event, setEvent] = React.useState<EventDetails | null>(null);
  const [rsvpSummary, setRsvpSummary] = React.useState<AdminRsvpSummary | null>(
    null,
  );
  const [rsvpSummaryError, setRsvpSummaryError] = React.useState<string | null>(
    null,
  );
  const [rsvpSummaryLoading, setRsvpSummaryLoading] = React.useState(false);
  const [rsvpReloadToken, setRsvpReloadToken] = React.useState(0);
  const [waitlist, setWaitlist] = React.useState<WaitlistEntry[] | null>(null);
  const [waitlistError, setWaitlistError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      const eventResult = await getEventDetails(eventId);
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
      const [summaryResult, waitlistResult] = await Promise.all([
        getEventRsvpSummary(eventId),
        getEventWaitlist(eventId),
      ]);
      if (cancelled) return;
      if (waitlistResult.success) {
        setWaitlist(waitlistResult.data ?? []);
        setWaitlistError(null);
      } else {
        setWaitlistError(waitlistResult.error || 'Failed to load waitlist');
      }
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

      {rsvpSummary && (
        <RsvpWavesCard
          eventId={event.id}
          summary={rsvpSummary}
          waitlist={waitlist}
          waitlistError={waitlistError}
          rsvpResponseWindowHours={event.rsvpResponseWindowHours}
          canManageRsvp={canManageRsvp}
          onWaveSent={() => setRsvpReloadToken((token) => token + 1)}
        />
      )}

      <RsvpSettingsCard
        eventId={event.id}
        rsvpResponseWindowHours={event.rsvpResponseWindowHours}
        onSaved={(hours) => {
          setEvent((current) =>
            current ? { ...current, rsvpResponseWindowHours: hours } : current,
          );
        }}
      />
    </div>
  );
}
