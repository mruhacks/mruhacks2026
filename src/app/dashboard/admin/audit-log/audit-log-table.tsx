'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from '@tanstack/react-table';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { FileJson, Filter, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableFacetedFilter } from '@/components/data-table/data-table-faceted-filter';
import { LocalDateTime } from '@/components/local-date-time';
import {
  listAuditLog,
  type AuditLogRow,
  type ListAuditLogResult,
} from '@/app/actions/audit-log';

interface AuditLogTableProps {
  initialData: ListAuditLogResult;
  /** Every action ever logged, for the action filter. */
  actions: string[];
  /** Every target type ever logged, for the target filter. */
  targetTypes: string[];
  /** `user:read:all` — whether user links lead anywhere for this viewer. */
  canReadUsers: boolean;
}

function filterValues(filters: ColumnFiltersState, id: string): string[] {
  const v = filters.find((f) => f.id === id)?.value;
  return Array.isArray(v) ? (v as string[]) : [];
}

function UserLink({
  id,
  label,
  canReadUsers,
}: {
  id: string;
  label: string;
  canReadUsers: boolean;
}) {
  if (!canReadUsers) return <span>{label}</span>;
  return (
    <Link
      href={`/dashboard/admin/users/${id}`}
      className='underline-offset-4 hover:underline'
    >
      {label}
    </Link>
  );
}

export function AuditLogTable({
  initialData,
  actions,
  targetTypes,
  canReadUsers,
}: AuditLogTableProps) {
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [actor, setActor] = React.useState<{
    id: string;
    name: string;
  } | null>(null);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [viewing, setViewing] = React.useState<AuditLogRow | null>(null);

  const actionFilter = filterValues(columnFilters, 'action');
  const targetTypeFilter = filterValues(columnFilters, 'target');

  // Debounce the search box input; only the debounced value feeds the query.
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset to page 1 whenever the filters/sort/pageSize change. Adjusted
  // during render (rather than in an effect) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const filtersKey = JSON.stringify([
    debouncedSearch,
    actionFilter,
    targetTypeFilter,
    actor?.id,
    pageSize,
    sorting,
  ]);
  const [prevFiltersKey, setPrevFiltersKey] = React.useState(filtersKey);
  if (filtersKey !== prevFiltersKey) {
    setPrevFiltersKey(filtersKey);
    setPage(1);
  }

  const sortDirection = sorting[0]?.desc === false ? 'asc' : 'desc';

  const isInitialQuery =
    page === initialData.page &&
    pageSize === initialData.pageSize &&
    debouncedSearch === '' &&
    actionFilter.length === 0 &&
    targetTypeFilter.length === 0 &&
    !actor &&
    sortDirection === 'desc';

  const {
    data = initialData,
    isFetching: loading,
    error,
  } = useQuery({
    queryKey: [
      'audit-log',
      {
        page,
        pageSize,
        search: debouncedSearch,
        actions: actionFilter,
        targetTypes: targetTypeFilter,
        actorId: actor?.id,
        sortDirection,
      },
    ],
    queryFn: async () => {
      const res = await listAuditLog({
        page,
        pageSize,
        search: debouncedSearch,
        actions: actionFilter,
        targetTypes: targetTypeFilter,
        actorId: actor?.id,
        sortDirection,
      });
      if (!res.success || !res.data) {
        throw new Error(res.success ? 'No data' : res.error);
      }
      return res.data;
    },
    placeholderData: keepPreviousData,
    initialData: isInitialQuery ? initialData : undefined,
  });

  React.useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const columns = React.useMemo<ColumnDef<AuditLogRow>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'When',
        enableSorting: true,
        enableHiding: false,
        cell: ({ row }) => (
          <LocalDateTime
            value={row.original.createdAt}
            dateStyle='medium'
            timeStyle='medium'
            className='whitespace-nowrap'
          />
        ),
      },
      {
        id: 'actor',
        header: 'Actor',
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original.actor;
          if (!a) {
            return (
              <span className='text-muted-foreground text-xs'>
                System / deleted user
              </span>
            );
          }
          return (
            <div className='group flex items-start gap-1'>
              <div className='min-w-0'>
                <div className='font-medium'>
                  <UserLink
                    id={a.id}
                    label={a.name}
                    canReadUsers={canReadUsers}
                  />
                </div>
                <div className='text-muted-foreground text-xs'>{a.email}</div>
              </div>
              <Button
                variant='ghost'
                size='icon'
                className='size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                title={`Only show actions by ${a.name}`}
                aria-label={`Only show actions by ${a.name}`}
                onClick={() => setActor({ id: a.id, name: a.name })}
              >
                <Filter className='size-3' />
              </Button>
            </div>
          );
        },
      },
      {
        accessorKey: 'action',
        header: 'Action',
        enableSorting: false,
        filterFn: () => true, // filtering runs server-side via listAuditLog
        cell: ({ row }) => (
          <Badge variant='secondary' className='font-mono'>
            {row.original.action}
          </Badge>
        ),
      },
      {
        id: 'target',
        accessorKey: 'targetType',
        header: 'Target',
        enableSorting: false,
        filterFn: () => true, // filtering runs server-side via listAuditLog
        cell: ({ row }) => {
          const { targetType, targetId } = row.original;
          return (
            <div className='min-w-0'>
              <div className='text-sm'>{targetType}</div>
              {targetId && (
                <div className='text-muted-foreground font-mono text-xs break-all'>
                  {targetType === 'user' ? (
                    <UserLink
                      id={targetId}
                      label={targetId}
                      canReadUsers={canReadUsers}
                    />
                  ) : (
                    targetId
                  )}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'details',
        header: 'Details',
        enableSorting: false,
        cell: ({ row }) => {
          const metadata = row.original.metadata;
          if (!metadata || Object.keys(metadata).length === 0) {
            return <span className='text-muted-foreground text-xs'>—</span>;
          }
          return (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setViewing(row.original)}
            >
              <FileJson className='size-4' /> View
            </Button>
          );
        },
      },
    ],
    [canReadUsers],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data.entries}
        getRowId={(row) => row.id}
        searchPlaceholder={null}
        enableColumnVisibility
        manualPagination
        pageIndex={page - 1}
        pageSize={pageSize}
        pageCount={data.totalPages}
        totalRows={data.total}
        onPageChange={(i) => setPage(i + 1)}
        onPageSizeChange={(s) => setPageSize(s)}
        onSortingChange={setSorting}
        initialSorting={sorting}
        onColumnFiltersChange={setColumnFilters}
        emptyMessage={
          loading ? 'Loading…' : 'No audit entries match these filters.'
        }
        toolbar={
          <>
            <input
              type='search'
              placeholder='Search action, target or actor…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-64 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]'
            />
            {actor && (
              <Button
                variant='secondary'
                size='sm'
                className='h-9'
                onClick={() => setActor(null)}
                aria-label={`Clear actor filter (${actor.name})`}
              >
                Actor: {actor.name}
                <X className='size-4' />
              </Button>
            )}
          </>
        }
        toolbarRight={(table) => (
          <>
            {actions.length > 0 && (
              <DataTableFacetedFilter
                column={table.getColumn('action')}
                title='Action'
                options={actions.map((a) => ({ label: a, value: a }))}
              />
            )}
            {targetTypes.length > 0 && (
              <DataTableFacetedFilter
                column={table.getColumn('target')}
                title='Target'
                options={targetTypes.map((t) => ({ label: t, value: t }))}
              />
            )}
          </>
        )}
      />

      <Dialog
        open={!!viewing}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className='font-mono'>
                  {viewing.action}
                </DialogTitle>
                <DialogDescription>
                  {viewing.actor
                    ? `${viewing.actor.name} (${viewing.actor.email})`
                    : 'System / deleted user'}{' '}
                  ·{' '}
                  <LocalDateTime
                    value={viewing.createdAt}
                    dateStyle='medium'
                    timeStyle='medium'
                    timeZoneName='short'
                  />
                </DialogDescription>
              </DialogHeader>
              <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm'>
                <dt className='text-muted-foreground'>Entry</dt>
                <dd className='font-mono text-xs break-all'>{viewing.id}</dd>
                <dt className='text-muted-foreground'>Target</dt>
                <dd className='font-mono text-xs break-all'>
                  {viewing.targetType}
                  {viewing.targetId && ` · ${viewing.targetId}`}
                </dd>
              </dl>
              <pre className='bg-muted max-h-[60vh] overflow-auto rounded-md p-3 text-xs'>
                {JSON.stringify(viewing.metadata, null, 2)}
              </pre>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
