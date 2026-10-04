'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CheckCircle2, CircleAlert, Clock } from 'lucide-react';

import {
  checkInParticipant,
  getCheckInRoster,
  getCheckInUpdates,
  scanCheckIn,
  undoCheckIn,
} from '@/app/dashboard/admin/events/check-in-actions';
import type {
  CheckInOutcome,
  CheckInRosterRow,
} from '@/app/dashboard/admin/events/check-in-actions';
import { cn } from '@/lib/utils';
import { CheckInRoster } from './check-in-roster';
import { CheckInScanner } from './check-in-scanner';
import {
  CheckInTargetSelector,
  type CheckInTargetOption,
} from './check-in-target-selector';
import {
  applyCheckIn,
  browserPollingHost,
  clearCheckIn,
  mergeCheckInUpdates,
  rosterWatermark,
  startRosterPolling,
} from './roster-sync';
import { playScanCue } from './scan-cue';

type ScanFeedback =
  | { kind: 'accepted'; outcome: CheckInOutcome }
  | { kind: 'duplicate'; outcome: CheckInOutcome }
  | { kind: 'rejected'; message: string };

const FEEDBACK_STYLES = {
  accepted: {
    icon: CheckCircle2,
    box: 'border-emerald-500/40 bg-emerald-500/10',
    iconColor: 'text-emerald-600',
  },
  duplicate: {
    icon: Clock,
    box: 'border-amber-500/40 bg-amber-500/10',
    iconColor: 'text-amber-600',
  },
  rejected: {
    icon: CircleAlert,
    box: 'border-destructive/40 bg-destructive/10',
    iconColor: 'text-destructive',
  },
};

function ScanFeedbackPanel({ feedback }: { feedback: ScanFeedback }) {
  const { icon: Icon, box, iconColor } = FEEDBACK_STYLES[feedback.kind];

  if (feedback.kind === 'rejected') {
    return (
      <div className={cn('flex items-start gap-3 rounded-xl border p-4', box)}>
        <Icon className={cn('mt-0.5 size-6 shrink-0', iconColor)} />
        <div className='min-w-0'>
          <p className='text-lg font-semibold sm:text-base'>Not checked in</p>
          <p className='text-muted-foreground text-sm'>{feedback.message}</p>
        </div>
      </div>
    );
  }

  const { outcome } = feedback;
  const duplicate = feedback.kind === 'duplicate';
  // Naming the sub-event back is the cheapest guard against a scanner left
  // armed on the wrong one: the mistake shows up on the first scan instead of
  // in the numbers a week later.
  const forTarget = outcome.targetName ? ` for ${outcome.targetName}` : '';

  return (
    <div className={cn('flex items-start gap-3 rounded-xl border p-4', box)}>
      <Icon className={cn('mt-0.5 size-6 shrink-0', iconColor)} />
      <div className='min-w-0'>
        <p className='text-lg font-semibold sm:text-base'>
          {duplicate
            ? `${outcome.name} was already checked in${forTarget}`
            : `${outcome.name} is checked in${forTarget}`}
        </p>
        <p className='text-muted-foreground text-sm'>
          At {outcome.checkedInAtLabel}
          {duplicate && outcome.checkedInByName
            ? ` by ${outcome.checkedInByName}`
            : ''}
          {duplicate ? '. This pass has already been used.' : '.'}
        </p>
      </div>
    </div>
  );
}

type CheckInPageProps = {
  eventId: string;
  eventName: string;
  subevents: CheckInTargetOption[];
  /** The armed target: `eventId` for the door, or one of `subevents`. */
  targetId: string;
  /** `?target=` named something that isn't a sub-event of this event. */
  unknownTarget?: boolean;
  /** …and specifically, it's a real schedule entry that isn't running now. */
  targetNotRunning?: boolean;
  /** The event is over: the server refuses every check-in and undo. */
  hasEnded?: boolean;
};

/**
 * The live check-in surface. Takes the event's uuid rather than the route's
 * `params`, because the `[eventId]` segment may be the event's custom slug —
 * `page.tsx` resolves it on the server so every action here is keyed by the
 * id the DB actually stores.
 *
 * `eventId` is always the *main* event: it's what the passes encode and what
 * eligibility is judged against. `targetId` is what a scan gets recorded
 * against, and is passed to every action as its trailing argument — the server
 * treats a target equal to `eventId` as the door, so there are no conditionals
 * at the call sites here.
 *
 * `page.tsx` remounts this component whenever the target changes, so all the
 * state below is per-target by construction.
 */
export function CheckInPage({
  eventId,
  eventName,
  subevents,
  targetId,
  unknownTarget = false,
  targetNotRunning = false,
  hasEnded = false,
}: CheckInPageProps) {
  const [roster, setRoster] = React.useState<CheckInRosterRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [feedback, setFeedback] = React.useState<ScanFeedback | null>(null);
  const [pendingUserId, setPendingUserId] = React.useState<string | null>(null);

  const scanBusyRef = React.useRef(false);
  const rosterRef = React.useRef<CheckInRosterRow[]>(roster);
  /** Bumped by every check-in or undo, so a poll that was already in flight
   *  when one landed discards its now-stale answer instead of replaying it. */
  const mutationSeqRef = React.useRef(0);
  const staleReloadRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchRoster(currentEventId: string, currentTarget: string) {
      const result = await getCheckInRoster(currentEventId, currentTarget);
      if (cancelled) return;

      if (result.success && result.data) {
        setRoster(result.data);
        setLoadError(null);
      } else if (!result.success) {
        setLoadError(result.error);
      }
      setLoading(false);
    }

    fetchRoster(eventId, targetId);
    return () => {
      cancelled = true;
    };
  }, [eventId, targetId, reloadToken]);

  // Someone else on a second scanner is checking people in too, so the list
  // on screen goes quietly out of date. Ask only what changed and patch it in.
  React.useEffect(() => {
    if (loading || loadError) return;

    let cancelled = false;
    let inFlight = false;

    async function poll(currentEventId: string, currentTarget: string) {
      if (inFlight) return;
      inFlight = true;
      const seq = mutationSeqRef.current;

      try {
        const result = await getCheckInUpdates(
          currentEventId,
          rosterWatermark(rosterRef.current),
          currentTarget,
        );
        if (cancelled || seq !== mutationSeqRef.current) return;
        if (!result.success || !result.data) return;

        const merge = mergeCheckInUpdates(rosterRef.current, result.data);
        if (merge.kind === 'patched') {
          setRoster(merge.rows);
          staleReloadRef.current = null;
        } else if (merge.kind === 'stale') {
          // A check-in can belong to someone the roster query no longer
          // returns — their approval was revoked after they arrived — and no
          // refetch will ever reconcile that. Reload once per distinct
          // mismatch rather than every fifteen seconds forever.
          const signature = `${result.data.checkedInCount}:${rosterRef.current.length}`;
          if (staleReloadRef.current !== signature) {
            staleReloadRef.current = signature;
            setReloadToken((token) => token + 1);
          }
        }
      } catch {
        // A dropped request is expected on venue wifi; the next tick retries.
      } finally {
        inFlight = false;
      }
    }

    // The scheduler owns when a poll may run — it stops the interval outright
    // while the page is backgrounded or unfocused, and polls the moment it
    // comes back.
    const stopPolling = startRosterPolling(
      () => void poll(eventId, targetId),
      browserPollingHost(),
    );

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [eventId, targetId, loading, loadError]);

  /** Writes a mutation's own result straight into the roster. Falls back to a
   *  full reload only when the roster has no row to patch. */
  const applyLocalPatch = React.useCallback(
    (patched: CheckInRosterRow[] | null) => {
      mutationSeqRef.current += 1;
      if (!patched) {
        setReloadToken((token) => token + 1);
        return;
      }
      // Written eagerly as well as through state so back-to-back scans each
      // build on the previous one rather than on the last committed render.
      rosterRef.current = patched;
      setRoster(patched);
    },
    [],
  );

  const handlePayload = React.useCallback(
    async (payload: string) => {
      if (scanBusyRef.current) return;
      scanBusyRef.current = true;

      try {
        const result = await scanCheckIn(eventId, payload, targetId);
        if (result.success && result.data) {
          const outcome = result.data;
          const kind = outcome.alreadyCheckedIn ? 'duplicate' : 'accepted';
          setFeedback({ kind, outcome });
          playScanCue(kind);
          if (!outcome.alreadyCheckedIn) {
            applyLocalPatch(applyCheckIn(rosterRef.current, outcome));
          }
        } else if (!result.success) {
          setFeedback({ kind: 'rejected', message: result.error });
          playScanCue('rejected');
        }
      } finally {
        scanBusyRef.current = false;
      }
    },
    [eventId, targetId, applyLocalPatch],
  );

  const handleManualCheckIn = React.useCallback(
    async (row: CheckInRosterRow) => {
      setPendingUserId(row.userId);
      try {
        const result = await checkInParticipant(eventId, row.userId, targetId);
        if (result.success && result.data) {
          const { name, alreadyCheckedIn, targetName } = result.data;
          const forTarget = targetName ? ` for ${targetName}` : '';
          toast.success(
            alreadyCheckedIn
              ? `${name} was already checked in${forTarget}.`
              : `${name} is checked in${forTarget}.`,
          );
          applyLocalPatch(applyCheckIn(rosterRef.current, result.data));
        } else if (!result.success) {
          toast.error(result.error);
        }
      } finally {
        setPendingUserId(null);
      }
    },
    [eventId, targetId, applyLocalPatch],
  );

  const handleUndo = React.useCallback(
    async (row: CheckInRosterRow) => {
      setPendingUserId(row.userId);
      try {
        const result = await undoCheckIn(eventId, row.userId, targetId);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(`Check-in for ${row.name} was undone.`);
        applyLocalPatch(clearCheckIn(rosterRef.current, row.userId));
      } finally {
        setPendingUserId(null);
      }
    },
    [eventId, targetId, applyLocalPatch],
  );

  const isSubeventArmed = targetId !== eventId;
  // Shown for an unknown target even with nothing else to offer: it's the
  // only way back to the door from a dead link.
  const selector =
    subevents.length > 0 || unknownTarget ? (
      <CheckInTargetSelector
        eventId={eventId}
        eventName={eventName}
        subevents={subevents}
        targetId={targetId}
      />
    ) : null;

  // The URL asked for a sub-event this event doesn't have. Show the picker so
  // they can choose a real one, but no scanner — arming the door instead of
  // what was asked for, silently, is the failure this guard exists to stop.
  if (unknownTarget) {
    return (
      <div className='space-y-6'>
        {selector}
        <p className='text-destructive py-8 text-center text-sm'>
          {targetNotRunning
            ? "That schedule entry isn't running right now."
            : "That schedule entry doesn't belong to this event."}{' '}
          Pick a check-in target above to start scanning.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className='space-y-6'>
        {selector}
        <div className='text-muted-foreground py-8 text-center'>Loading...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className='space-y-6'>
        {selector}
        <p className='text-destructive py-8 text-center'>{loadError}</p>
      </div>
    );
  }

  const checkedInCount = roster.filter((row) => row.checkedInAt).length;
  // For a sub-event the population that matters is the people who actually
  // turned up, not everyone registered: "18 of 40 who are here" is the number a
  // meal volunteer is working against, while "18 of 300" tells them nothing.
  const total = isSubeventArmed
    ? roster.filter((row) => row.atMainEvent).length
    : roster.length;
  const progress = total ? Math.round((checkedInCount / total) * 100) : 0;

  return (
    <div className='space-y-6'>
      {selector}

      <div className='space-y-2'>
        <div>
          <h2 className='text-lg font-semibold'>Check-in</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {checkedInCount} of {total}{' '}
            {isSubeventArmed ? 'here checked in' : 'checked in'}
          </p>
        </div>
        <div className='bg-muted h-2 w-full overflow-hidden rounded-full'>
          <div
            className='bg-primary h-full rounded-full transition-[width]'
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr] lg:items-start'>
        <div className='space-y-3 lg:sticky lg:top-6'>
          {hasEnded ? (
            // No camera at all: every scan would only come back rejected.
            <div className='text-muted-foreground rounded-xl border p-4 text-sm'>
              This event has ended. Check-in is frozen — the roster below is the
              final record.
            </div>
          ) : (
            <>
              <CheckInScanner onPayload={handlePayload} />
              {feedback && <ScanFeedbackPanel feedback={feedback} />}
            </>
          )}
        </div>

        <CheckInRoster
          rows={roster}
          pendingUserId={pendingUserId}
          requiresDoorCheckIn={isSubeventArmed}
          frozen={hasEnded}
          onCheckIn={handleManualCheckIn}
          onUndo={handleUndo}
        />
      </div>
    </div>
  );
}
