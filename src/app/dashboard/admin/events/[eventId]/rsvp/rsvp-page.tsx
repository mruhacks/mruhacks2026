'use client';

import * as React from 'react';

import {
  getEventRsvpSummary,
  getEventWaitlist,
} from '@/app/dashboard/admin/events/actions';
import type {
  AdminRsvpSummary,
  WaitlistEntry,
} from '@/app/dashboard/admin/events/actions';
import { AdminRsvpOverviewCard } from '@/app/dashboard/admin/events/AdminRsvpOverviewCard';
import { RsvpSettingsCard } from '@/app/dashboard/admin/events/RsvpSettingsCard';
import { RsvpWavesCard } from '@/app/dashboard/admin/events/RsvpWavesCard';

/**
 * Takes the event's uuid rather than the route's `params`: the `[eventId]`
 * segment may be the event's custom slug, and `page.tsx` resolves it on the
 * server so the RSVP actions are keyed by the stored id. The event's RSVP
 * settings come from there too, rather than from `getEventDetails`, which
 * needs event:manage — more than this page's own `rsvp:read:all`.
 *
 * No breadcrumb registration here — the event layout above already maps this
 * segment to the event's name.
 */
export function EventRsvpPage({
  eventId,
  hasApplication,
  rsvpResponseWindowHours: initialResponseWindowHours,
  canManageEvent,
  canManageRsvp,
}: {
  eventId: string;
  hasApplication: boolean;
  rsvpResponseWindowHours: number;
  /** Viewer holds `event:manage:all`: may send waves, resend invitations and
   *  change the response window. */
  canManageEvent: boolean;
  /** Viewer holds `rsvp:write:all`: may close an open wave early. */
  canManageRsvp: boolean;
}) {
  const [rsvpResponseWindowHours, setRsvpResponseWindowHours] = React.useState(
    initialResponseWindowHours,
  );
  const [rsvpSummary, setRsvpSummary] = React.useState<AdminRsvpSummary | null>(
    null,
  );
  const [rsvpSummaryError, setRsvpSummaryError] = React.useState<string | null>(
    null,
  );
  const [rsvpSummaryLoading, setRsvpSummaryLoading] =
    React.useState(hasApplication);
  const [rsvpReloadToken, setRsvpReloadToken] = React.useState(0);
  const [waitlist, setWaitlist] = React.useState<WaitlistEntry[] | null>(null);
  const [waitlistError, setWaitlistError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!hasApplication) return;

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
  }, [eventId, hasApplication, rsvpReloadToken]);

  if (!hasApplication) {
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
          eventId={eventId}
          summary={rsvpSummary}
          waitlist={waitlist}
          waitlistError={waitlistError}
          rsvpResponseWindowHours={rsvpResponseWindowHours}
          canManageEvent={canManageEvent}
          canManageRsvp={canManageRsvp}
          onWaveSent={() => setRsvpReloadToken((token) => token + 1)}
        />
      )}

      {canManageEvent && (
        <RsvpSettingsCard
          eventId={eventId}
          rsvpResponseWindowHours={rsvpResponseWindowHours}
          onSaved={setRsvpResponseWindowHours}
        />
      )}
    </div>
  );
}
