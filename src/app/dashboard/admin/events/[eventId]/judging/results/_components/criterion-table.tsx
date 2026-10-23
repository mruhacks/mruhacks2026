'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import type { JudgingResults } from '@/app/dashboard/admin/events/judging-actions';
import { DataTable } from '@/components/data-table/data-table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { formatNumber } from './format';
import { useResults } from './results-context';

type Row = JudgingResults['byCriterion'][number]['rows'][number] & {
  rank: number;
};

/**
 * The label for one of Crowd-BT's statistics. It sits inside the header's
 * sort button, so the tooltip trigger is a plain span rather than a second
 * button nested in the first.
 */
function StatHeader({ symbol, description }: { symbol: string; description: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='cursor-help underline decoration-dotted underline-offset-4'>{symbol}</span>
      </TooltipTrigger>
      <TooltipContent className='max-w-64 text-left normal-case'>{description}</TooltipContent>
    </Tooltip>
  );
}

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: 'rank',
    header: '#',
    enableHiding: false,
    meta: { className: 'w-12 tabular-nums' },
  },
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
  {
    // Named ids, since the column menu falls back to the id for a header
    // that isn't a plain string.
    id: 'mean',
    accessorKey: 'mu',
    header: () => (
      <StatHeader
        symbol='μ'
        description='The estimated quality score for this criterion; rows are ranked by it. Starts at 0 and moves up with each win and down with each loss. Only the relative order is meaningful.'
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue<number>()),
    // `normal-case` keeps the table's uppercase header styling from
    // rendering μ and σ as Μ and Σ.
    meta: { className: 'text-right tabular-nums normal-case' },
  },
  {
    id: 'variance',
    accessorKey: 'sigmaSq',
    header: () => (
      <StatHeader
        symbol='σ²'
        description="How uncertain the estimate is. Starts at 1 and shrinks as the project is compared. A large σ² means the project's position could still change."
      />
    ),
    cell: ({ getValue }) => formatNumber(getValue<number>()),
    meta: { className: 'text-right tabular-nums normal-case' },
  },
  {
    accessorKey: 'comparisons',
    header: 'Comparisons',
    meta: { className: 'text-right tabular-nums' },
  },
];

/** One criterion's ranking, by its Crowd-BT mean. */
export function CriterionTable({ criterionId }: { criterionId: string }) {
  const { results } = useResults();
  const criterion = results.byCriterion.find((c) => c.id === criterionId);

  const rows = React.useMemo<Row[]>(
    () =>
      (criterion?.rows ?? []).map((row, index) => ({
        ...row,
        rank: index + 1,
      })),
    [criterion],
  );

  if (!criterion) {
    return <p className='text-muted-foreground text-sm'>This criterion no longer exists.</p>;
  }

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
