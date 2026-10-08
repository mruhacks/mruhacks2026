'use client';

import * as React from 'react';

import {
  getJudgingResults,
  setSubmissionPlacement,
  type JudgingResults,
  type ResultsProjectRow,
} from '@/app/dashboard/admin/events/judging-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JUDGE_PRIOR } from '@/lib/judging/crowd-bt';
import { MAX_PLACEMENT } from '@/lib/judging/limits';
import { reliabilityMean } from '@/lib/judging/results';

/** How often the open page re-pulls results while judging is under way. */
const POLL_MS = 15_000;

const formatNumber = (value: number) => value.toFixed(3);
const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Live results, polled while the tab is visible. Every poll replays all the
 * votes, so what's shown is always the full recomputation, never a drifting
 * client-side tally.
 */
export function ResultsView({
  eventId,
  initial,
}: {
  eventId: string;
  initial: JudgingResults;
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

  const { canViewRankings, canAward } = results;
  const award = canAward ? { eventId, onChanged: refresh } : null;

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <h2 className='text-xl font-semibold'>
          {canViewRankings ? 'Results' : 'Awards'}
        </h2>
        <p className='text-muted-foreground text-sm'>
          {results.provisional
            ? 'Provisional: submissions are still open, so projects can still join or leave the pool. '
            : 'Only projects published at the submission deadline, and not deactivated, are included. '}
          {canViewRankings
            ? 'Updates every few seconds while this page is open.'
            : 'Record placements once the panel has decided.'}
        </p>
      </div>

      {!canViewRankings ? (
        <Card className='py-0'>
          <ProjectTable
            rows={results.overall}
            award={award}
            showScore={false}
          />
        </Card>
      ) : (
        <Tabs defaultValue='overall'>
          <TabsList className='max-w-full flex-wrap'>
            <TabsTrigger value='overall'>Overall</TabsTrigger>
            {results.byCriterion.map((criterion) => (
              <TabsTrigger key={criterion.id} value={criterion.id}>
                {criterion.name}
              </TabsTrigger>
            ))}
            <TabsTrigger value='judges'>Judges</TabsTrigger>
          </TabsList>

          <TabsContent value='overall'>
            <Card className='py-0'>
              <ProjectTable rows={results.overall} award={award} showScore />
            </Card>
          </TabsContent>

          {results.byCriterion.map((criterion) => (
            <TabsContent key={criterion.id} value={criterion.id}>
              <Card className='py-0'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-12'>#</TableHead>
                      <TableHead className='w-16'>Table</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className='text-right'>μ</TableHead>
                      <TableHead className='text-right'>σ²</TableHead>
                      <TableHead className='text-right'>Comparisons</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {criterion.rows.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell className='tabular-nums'>
                          {index + 1}
                        </TableCell>
                        <TableCell className='tabular-nums'>
                          {row.tableLabel}
                        </TableCell>
                        <TableCell className='font-medium whitespace-normal'>
                          {row.title}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(row.mu)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(row.sigmaSq)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {row.comparisons}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          ))}

          <TabsContent value='judges'>
            <Card className='py-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judge</TableHead>
                    <TableHead className='text-right'>Comparisons</TableHead>
                    {results.criteria.map((criterion) => (
                      <TableHead key={criterion.id} className='text-right'>
                        {criterion.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.judges.map((judge) => (
                    <TableRow key={judge.id}>
                      <TableCell className='whitespace-normal'>
                        <span className='font-medium'>{judge.label}</span>{' '}
                        {judge.disabled && (
                          <Badge variant='destructive'>Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {judge.comparisons}
                      </TableCell>
                      {results.criteria.map((criterion) => (
                        <TableCell
                          key={criterion.id}
                          className='text-right tabular-nums'
                        >
                          {formatPercent(judge.reliability[criterion.id] ?? 0)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className='text-muted-foreground px-4 pb-4 text-xs'>
                Reliability is how likely the model thinks each judge is to vote
                with the consensus on that criterion — α / (α + β). Every judge
                starts at {formatPercent(reliabilityMean(JUDGE_PRIOR))}.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type AwardControls = { eventId: string; onChanged: () => Promise<void> } | null;

function ProjectTable({
  rows,
  award,
  showScore,
}: {
  rows: ResultsProjectRow[];
  award: AwardControls;
  showScore: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className='text-muted-foreground p-6 text-center text-sm'>
        No published projects yet.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showScore && <TableHead className='w-12'>#</TableHead>}
          <TableHead className='w-16'>Table</TableHead>
          <TableHead>Project</TableHead>
          {showScore && <TableHead className='text-right'>Score</TableHead>}
          <TableHead>Placement</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={row.id}>
            {showScore && (
              <TableCell className='tabular-nums'>{index + 1}</TableCell>
            )}
            <TableCell className='tabular-nums'>{row.tableLabel}</TableCell>
            <TableCell className='font-medium whitespace-normal'>
              {row.title}
            </TableCell>
            {showScore && (
              <TableCell className='text-right tabular-nums'>
                {formatNumber(row.score ?? 0)}
              </TableCell>
            )}
            <TableCell>
              <PlacementInput row={row} award={award} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PlacementInput({
  row,
  award,
}: {
  row: ResultsProjectRow;
  award: AwardControls;
}) {
  const saved = row.placement == null ? '' : String(row.placement);
  const [value, setValue] = React.useState(saved);
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);

  // Follow the server's value when it changes under us (a poll, another
  // organizer), unless the field holds an unsaved edit.
  const [lastSaved, setLastSaved] = React.useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    if (value === lastSaved) setValue(saved);
  }

  if (!award) return row.placement == null ? null : <>{row.placement}</>;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!award) return;
    const trimmed = value.trim();
    const placement = trimmed === '' ? null : Number(trimmed);
    if (placement !== null && !Number.isInteger(placement)) {
      setError('Enter a whole number.');
      return;
    }
    setSaving(true);
    try {
      const result = await setSubmissionPlacement(
        award.eventId,
        row.id,
        placement,
      );
      if (!result.success) {
        setError(result.error);
      } else {
        await award.onChanged();
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className='flex flex-col gap-1'>
      <div className='flex items-center gap-1'>
        <Input
          type='number'
          inputMode='numeric'
          min={1}
          max={MAX_PLACEMENT}
          className='h-8 w-20'
          aria-label={`Placement: ${row.title}`}
          aria-invalid={Boolean(error)}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
        />
        {value !== saved && (
          <Button type='submit' size='sm' variant='outline' disabled={saving}>
            Save
          </Button>
        )}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </form>
  );
}
