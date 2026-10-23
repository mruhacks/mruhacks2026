'use client';

import * as React from 'react';

import { getJudgingResults, type JudgingResults } from '@/app/dashboard/admin/events/judging-actions';
import { TooltipProvider } from '@/components/ui/tooltip';

/** How often the open page re-pulls results while judging is under way. */
const POLL_MS = 15_000;

type ResultsContextValue = {
  eventId: string;
  results: JudgingResults;
  /** Re-pulls results now, e.g. after recording a placement. */
  refresh: () => Promise<void>;
};

const ResultsContext = React.createContext<ResultsContextValue | null>(null);

/**
 * Live results, polled while the tab is visible. Every poll replays all the
 * votes, so what's shown is always the full recomputation, never a drifting
 * client-side tally. Lives in the results layout, so it keeps polling — and
 * keeps its data — as the viewer moves between tables.
 */
export function ResultsProvider({
  eventId,
  initial,
  children,
}: {
  eventId: string;
  initial: JudgingResults;
  children: React.ReactNode;
}) {
  const [results, setResults] = React.useState(initial);

  const refresh = React.useCallback(async () => {
    // A failed poll keeps what's on screen; the next one tries again.
    const next = await getJudgingResults(eventId).catch(() => null);
    if (next?.success && next.data) setResults(next.data);
  }, [eventId]);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const value = React.useMemo(() => ({ eventId, results, refresh }), [eventId, results, refresh]);

  return (
    <ResultsContext.Provider value={value}>
      <TooltipProvider>{children}</TooltipProvider>
    </ResultsContext.Provider>
  );
}

export function useResults(): ResultsContextValue {
  const value = React.useContext(ResultsContext);
  if (!value) throw new Error('useResults must be used inside ResultsProvider');
  return value;
}
