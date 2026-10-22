'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { setSubmissionPlacement, type ResultsProjectRow } from '@/app/dashboard/admin/events/judging-actions';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import * as Judging from '@/lib/judging';

import { formatNumber } from './format';
import { useResults } from './results-context';

type Row = ResultsProjectRow & { rank: number };

type AwardControls = { eventId: string; onChanged: () => Promise<void> } | null;

/**
 * The whole pool by Overall score, with placements alongside. Without
 * `judging:results:all` the server sends it in table order and unscored, so
 * the rank and score columns are left out rather than shown as noise.
 */
export function OverallTable() {
  const { eventId, results, refresh } = useResults();
  const { canViewRankings, canAward } = results;
  const award = React.useMemo<AwardControls>(
    () => (canAward ? { eventId, onChanged: refresh } : null),
    [canAward, eventId, refresh],
  );

  const rows = React.useMemo<Row[]>(
    () => results.overall.map((row, index) => ({ ...row, rank: index + 1 })),
    [results.overall],
  );

  const columns = React.useMemo<ColumnDef<Row>[]>(
    () => [
      ...(canViewRankings
        ? [
            {
              accessorKey: 'rank',
              header: '#',
              enableHiding: false,
              meta: { className: 'w-12 tabular-nums' },
            } satisfies ColumnDef<Row>,
          ]
        : []),
      {
        id: 'table',
        accessorFn: (row) => row.tableSlot ?? undefined,
        sortUndefined: 'last',
        header: 'Table',
        cell: ({ row }) => row.original.tableLabel,
        meta: { className: 'w-16 tabular-nums' },
      },
      {
        accessorKey: 'title',
        header: 'Project',
        enableHiding: false,
        meta: { className: 'font-medium whitespace-normal' },
      },
      ...(canViewRankings
        ? [
            {
              id: 'score',
              accessorFn: (row) => row.score ?? 0,
              header: 'Score',
              cell: ({ getValue }) => formatNumber(getValue<number>()),
              meta: { className: 'text-right tabular-nums' },
            } satisfies ColumnDef<Row>,
          ]
        : []),
      {
        id: 'placement',
        accessorFn: (row) => row.placement ?? undefined,
        sortUndefined: 'last',
        header: 'Placement',
        cell: ({ row }) => <PlacementInput row={row.original} award={award} />,
      },
    ],
    [canViewRankings, award],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder='Search projects…'
      emptyMessage='No published projects yet.'
      pageSize={50}
      compact
    />
  );
}

function PlacementInput({ row, award }: { row: ResultsProjectRow; award: AwardControls }) {
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
      const result = await setSubmissionPlacement(award.eventId, row.id, placement);
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
          max={Judging.MAX_PLACEMENT}
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
