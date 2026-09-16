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
  applyCheckIn,
  clearCheckIn,
  mergeCheckInUpdates,
  rosterWatermark,
  ROSTER_POLL_INTERVAL_MS,
} from './roster-sync';
import { playScanCue } from './scan-cue';

type CheckInPageProps = {
  params: Promise<{ eventId: string }>;
};

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

  return (
    <div className={cn('flex items-start gap-3 rounded-xl border p-4', box)}>
      <Icon className={cn('mt-0.5 size-6 shrink-0', iconColor)} />
      <div className='min-w-0'>
        <p className='text-lg font-semibold sm:text-base'>
          {duplicate
            ? `${outcome.name} was already checked in`
            : `${outcome.name} is checked in`}
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

export default function CheckInPage({ params }: CheckInPageProps) {
  const [eventId, setEventId] = React.useState<string | null>(null);
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
    params.then((p) => setEventId(p.eventId));
  }, [params]);

  React.useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    async function fetchRoster(currentEventId: string) {
      const result = await getCheckInRoster(currentEventId);
      if (cancelled) return;

      if (result.success && result.data) {
        setRoster(result.data);
        setLoadError(null);
      } else if (!result.success) {
        setLoadError(result.error);
      }
      setLoading(false);
    }

    fetchRoster(eventId);
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadToken]);

  // Someone else on a second scanner is checking people in too, so the list
  // on screen goes quietly out of date. Ask only what changed and patch it in.
  React.useEffect(() => {
    if (!eventId || loading || loadError) return;

    let cancelled = false;
    let inFlight = false;

    async function poll(currentEventId: string) {
      if (inFlight || document.hidden) return;
      inFlight = true;
      const seq = mutationSeqRef.current;

      try {
        const result = await getCheckInUpdates(
          currentEventId,
          rosterWatermark(rosterRef.current),
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

    const tick = () => void poll(eventId);
    const timer = setInterval(tick, ROSTER_POLL_INTERVAL_MS);
    // A phone that was asleep in a pocket wakes with a stale list; waiting out
    // the interval makes it look frozen at exactly the wrong moment.
    document.addEventListener('visibilitychange', tick);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [eventId, loading, loadError]);

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
      if (!eventId || scanBusyRef.current) return;
      scanBusyRef.current = true;

      try {
        const result = await scanCheckIn(eventId, payload);
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
    [eventId, applyLocalPatch],
  );

  const handleManualCheckIn = React.useCallback(
    async (row: CheckInRosterRow) => {
      if (!eventId) return;
      setPendingUserId(row.userId);
      try {
        const result = await checkInParticipant(eventId, row.userId);
        if (result.success && result.data) {
          const { name, alreadyCheckedIn } = result.data;
          toast.success(
            alreadyCheckedIn
              ? `${name} was already checked in.`
              : `${name} is checked in.`,
          );
          applyLocalPatch(applyCheckIn(rosterRef.current, result.data));
        } else if (!result.success) {
          toast.error(result.error);
        }
      } finally {
        setPendingUserId(null);
      }
    },
    [eventId, applyLocalPatch],
  );

  const handleUndo = React.useCallback(
    async (row: CheckInRosterRow) => {
      if (!eventId) return;
      setPendingUserId(row.userId);
      try {
        const result = await undoCheckIn(eventId, row.userId);
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
    [eventId, applyLocalPatch],
  );

  if (loading) {
    return (
      <div className='text-muted-foreground py-8 text-center'>Loading...</div>
    );
  }

  if (loadError) {
    return <p className='text-destructive py-8 text-center'>{loadError}</p>;
  }

  const checkedInCount = roster.filter((row) => row.checkedInAt).length;
  const progress = roster.length
    ? Math.round((checkedInCount / roster.length) * 100)
    : 0;

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <div>
          <h2 className='text-lg font-semibold'>Check-in</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {checkedInCount} of {roster.length} checked in
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
          <CheckInScanner onPayload={handlePayload} />
          {feedback && <ScanFeedbackPanel feedback={feedback} />}
        </div>

        <CheckInRoster
          rows={roster}
          pendingUserId={pendingUserId}
          onCheckIn={handleManualCheckIn}
          onUndo={handleUndo}
        />
      </div>
    </div>
  );
}
