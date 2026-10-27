'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import type { JudgingResults } from '@/app/dashboard/admin/events/judging-actions';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import * as Judging from '@/lib/judging';

import { formatPercent } from './format';
import { useResults } from './results-context';

type Row = JudgingResults['judges'][number];

/** Each judge's workload, and how far the model trusts them per criterion. */
export function JudgesTable() {
  const { results } = useResults();

  const columns = React.useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'label',
        header: 'Judge',
        enableHiding: false,
        cell: ({ row }) => (
          <span className='whitespace-normal'>
            <span className='font-medium'>{row.original.label}</span>{' '}
            {row.original.disabled && <Badge variant='destructive'>Disabled</Badge>}
          </span>
        ),
      },
      {
        accessorKey: 'comparisons',
        header: 'Comparisons',
        meta: { className: 'text-right tabular-nums' },
      },
      ...results.criteria.map(
        (criterion): ColumnDef<Row> => ({
          id: `reliability:${criterion.id}`,
          accessorFn: (row) => row.reliability[criterion.id] ?? 0,
          header: criterion.name,
          cell: ({ getValue }) => formatPercent(getValue<number>()),
          meta: { className: 'text-right tabular-nums' },
        }),
      ),
    ],
    [results.criteria],
  );

  return (
    <div className='flex flex-col gap-2'>
      <DataTable
        columns={columns}
        data={results.judges}
        getRowId={(row) => row.id}
        searchPlaceholder='Search judges…'
        emptyMessage='No judges yet.'
        pageSize={50}
        compact
      />
      <p className='text-muted-foreground text-xs'>
        Reliability is how likely the model thinks each judge is to vote with the consensus on that criterion — α / (α +
        β). Every judge starts at {formatPercent(Judging.reliabilityMean(Judging.JUDGE_PRIOR))}.
      </p>
    </div>
  );
}
