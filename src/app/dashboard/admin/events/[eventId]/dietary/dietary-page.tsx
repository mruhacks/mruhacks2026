'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import { getDietaryReport } from '@/app/dashboard/admin/events/dietary-actions';
import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  MISSED_MEAL_THRESHOLDS,
  TOTAL_LABEL,
  summarizeDietaryReport,
  type DietaryReport,
  type DietaryReportRow,
} from '@/lib/dietary/report';
import { dietaryRestrictionsList } from '@/types/lookups';

export function DietaryPage({ eventId, threshold: initialThreshold }: { eventId: string; threshold: number }) {
  const pathname = usePathname();
  const [threshold, setThreshold] = React.useState(initialThreshold);
  const [report, setReport] = React.useState<DietaryReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState<string[]>([]);
  const [warningsFirst, setWarningsFirst] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const gotData = React.useRef(false);

  React.useEffect(() => {
    let gone = false;

    (async () => {
      setBusy(true);
      try {
        const result = await getDietaryReport(eventId);
        if (gone) return;
        if (result.success && result.data) {
          setReport(result.data);
          gotData.current = true;
          setUpdatedAt(new Date().toISOString());
          setStale(false);
          setError(null);
        } else if (gotData.current) {
          setStale(true);
        } else if (!result.success) {
          setError(result.error);
        }
      } catch {
        if (gone) return;
        if (gotData.current) setStale(true);
        else setError("Couldn't load the report.");
      } finally {
        if (!gone) setBusy(false);
      }
    })();

    return () => {
      gone = true;
    };
  }, [eventId, tick]);

  React.useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  function pickThreshold(value: string) {
    setThreshold(Number(value));
    window.history.replaceState(null, '', `${pathname}?missed=${value}`);
  }

  if (!report && !error) {
    return <div className='text-muted-foreground py-8 text-center'>Loading...</div>;
  }

  if (!report) {
    return (
      <div className='space-y-3 py-8 text-center'>
        <p className='text-destructive text-sm'>{error}</p>
        <Button type='button' variant='outline' size='sm' onClick={() => setTick((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  const summary = summarizeDietaryReport(report.rows, threshold);
  const people = report.rows
    .filter((row) => filter.length === 0 || row.restrictions.some((label) => filter.includes(label)))
    .sort((a, b) => {
      if (warningsFirst) {
        if (b.missedStreak !== a.missedStreak) return b.missedStreak - a.missedStreak;
        if (a.atDoor !== b.atDoor) return a.atDoor ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h2 className='text-lg font-semibold'>Dietary</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Who&apos;s coming and what they can eat. Don&apos;t take anyone off the totals.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {report.hasMeals && (
            <Select value={String(threshold)} onValueChange={pickThreshold}>
              <SelectTrigger aria-label='Missed meals threshold'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MISSED_MEAL_THRESHOLDS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    Missed {n} meal{n === 1 ? '' : 's'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-9'
            disabled={busy}
            onClick={() => setTick((n) => n + 1)}
          >
            <RefreshCw aria-hidden className='size-4' />
            Refresh
          </Button>
        </div>
      </div>

      {stale ? (
        <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200'>
          Couldn&apos;t refresh. Still showing <LocalDateTime value={updatedAt} dateStyle='short' timeStyle='medium' />
        </p>
      ) : (
        updatedAt && (
          <p className='text-muted-foreground text-xs'>
            Updated <LocalDateTime value={updatedAt} dateStyle='short' timeStyle='medium' />
          </p>
        )
      )}

      {!report.hasMeals && (
        <p className='text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-sm'>
          No meals tagged yet. Door warnings still show.
        </p>
      )}
      {report.hasMeals && report.countedMealCount < threshold && (
        <p className='text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-sm'>
          Need {threshold} meals for warnings ({report.countedMealCount} so far).
        </p>
      )}

      <div className='space-y-2'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Restriction</TableHead>
              <TableHead className='text-right'>Expected</TableHead>
              <TableHead className='text-right'>At door</TableHead>
              <TableHead className='text-right'>Not at door</TableHead>
              {report.hasMeals && (
                <TableHead className='text-right'>
                  Missed last {threshold} meal{threshold === 1 ? '' : 's'}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.map((row) => (
              <TableRow key={row.label} className={row.label === TOTAL_LABEL ? 'font-medium' : undefined}>
                <TableCell>{row.label}</TableCell>
                <TableCell className='text-right tabular-nums'>{row.expected}</TableCell>
                <TableCell className='text-right tabular-nums'>{row.atDoor}</TableCell>
                <TableCell className='text-right tabular-nums'>{row.notAtDoor}</TableCell>
                {report.hasMeals && <TableCell className='text-right tabular-nums'>{row.missed}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className='text-muted-foreground text-xs'>Someone can show up in more than one row. Total is people.</p>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        {dietaryRestrictionsList.map((label) => (
          <Button
            key={label}
            type='button'
            size='sm'
            className='h-8'
            variant={filter.includes(label) ? 'default' : 'outline'}
            onClick={() => setFilter((cur) => (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]))}
          >
            {label}
          </Button>
        ))}
        <Button
          type='button'
          size='sm'
          className='ml-auto h-8'
          variant={warningsFirst ? 'default' : 'outline'}
          onClick={() => setWarningsFirst((on) => !on)}
        >
          Warnings first
        </Button>
      </div>

      {people.length === 0 ? (
        <p className='text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm'>
          {report.rows.length === 0 ? 'No one accepted yet.' : 'No matches.'}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Restrictions</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((row) => (
              <PersonRow
                key={row.userId}
                row={row}
                threshold={threshold}
                showMeals={report.hasMeals}
                currentMeal={report.currentMeal?.name ?? null}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function PersonRow({
  row,
  threshold,
  showMeals,
  currentMeal,
}: {
  row: DietaryReportRow;
  threshold: number;
  showMeals: boolean;
  currentMeal: string | null;
}) {
  const missed = showMeals ? row.missedStreak : 0;

  return (
    <TableRow>
      <TableCell className='align-top'>
        <p className='font-medium'>{row.name}</p>
        <div className='mt-1 flex flex-wrap gap-1'>
          {!row.atDoor && <Badge variant='destructive'>Did not check in at door</Badge>}
          {missed >= threshold && (
            <Badge variant='warning' title={row.missedMeals.map((m) => m.name).join(', ')}>
              Missed last {missed} meal{missed === 1 ? '' : 's'}
            </Badge>
          )}
          {showMeals && row.notAtCurrentMeal && currentMeal && (
            <Badge variant='outline' className='text-muted-foreground'>
              Not seen at {currentMeal} (in progress)
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className='align-top'>
        {row.restrictions.length === 0 ? (
          <span className='text-muted-foreground'>None</span>
        ) : (
          <div className='flex flex-wrap items-center gap-1'>
            {row.restrictions.map((label) => (
              <Badge key={label} variant='secondary'>
                {label}
              </Badge>
            ))}
            {row.otherText && <span className='text-muted-foreground text-xs'>{row.otherText}</span>}
          </div>
        )}
      </TableCell>
      <TableCell className='align-top'>
        {row.lastSeenAt ? (
          <LocalDateTime value={row.lastSeenAt} dateStyle='short' timeStyle='short' />
        ) : (
          <span className='text-muted-foreground'>—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
