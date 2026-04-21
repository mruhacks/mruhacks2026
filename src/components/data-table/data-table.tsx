'use client';

/**
 * A generic, reusable TanStack-table-powered DataTable.
 *
 * Supports client-side sorting, a column visibility menu, a global filter
 * input, and pagination that can be either client-side or driven by the
 * parent (set `manualPagination` when paginating server-side).
 */

import * as React from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  Table as TanstackTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Settings2,
} from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Placeholder for the global filter input. Set to null to hide the input. */
  searchPlaceholder?: string | null;
  /** Enable column visibility picker. Default: true. */
  enableColumnVisibility?: boolean;
  /** Additional toolbar elements rendered next to the search box. */
  toolbar?: React.ReactNode;
  /** Render-prop for extra content in the toolbar that receives the table. */
  toolbarRight?: (table: TanstackTable<TData>) => React.ReactNode;
  /** Pagination controls. When manualPagination is true, pagination state/onPageChange is expected. */
  manualPagination?: boolean;
  pageIndex?: number;
  pageSize?: number;
  pageCount?: number;
  totalRows?: number;
  onPageChange?: (nextPageIndex: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Message when there is no data. */
  emptyMessage?: React.ReactNode;
  /** Compact styling. */
  compact?: boolean;
  /** Optional initial sorting. */
  initialSorting?: SortingState;
  /** Called whenever the user toggles a sort via column header click. */
  onSortingChange?: (sorting: SortingState) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = 'Search…',
  enableColumnVisibility = true,
  toolbar,
  toolbarRight,
  manualPagination = false,
  pageIndex,
  pageSize,
  pageCount,
  totalRows,
  onPageChange,
  onPageSizeChange,
  emptyMessage = 'No results.',
  compact = false,
  initialSorting = [],
  onSortingChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      ...(manualPagination
        ? {
            pagination: {
              pageIndex: pageIndex ?? 0,
              pageSize: pageSize ?? 25,
            },
          }
        : {}),
    },
    manualPagination,
    pageCount: manualPagination ? (pageCount ?? -1) : undefined,
    onSortingChange: (updater) => {
      setSorting((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        onSortingChange?.(next);
        return next;
      });
    },
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: manualPagination
      ? undefined
      : getPaginationRowModel(),
  });

  const showSearch = searchPlaceholder !== null;

  const resolvedPageIndex = manualPagination
    ? (pageIndex ?? 0)
    : table.getState().pagination.pageIndex;
  const resolvedPageSize = manualPagination
    ? (pageSize ?? 25)
    : table.getState().pagination.pageSize;
  const resolvedPageCount = manualPagination
    ? (pageCount ?? 0)
    : table.getPageCount();

  return (
    <div className='space-y-3'>
      {(showSearch || toolbar || toolbarRight || enableColumnVisibility) && (
        <div className='flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex flex-wrap items-center gap-2'>
            {showSearch && (
              <Input
                placeholder={searchPlaceholder ?? 'Search…'}
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className='h-9 max-w-xs'
              />
            )}
            {toolbar}
          </div>
          <div className='flex items-center gap-2'>
            {toolbarRight?.(table)}
            {enableColumnVisibility && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' size='sm' className='h-9'>
                    <Settings2 className='size-4' />
                    <span className='hidden sm:inline'>Columns</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-44'>
                  {table
                    .getAllColumns()
                    .filter((c) => c.getCanHide())
                    .map((c) => (
                      <DropdownMenuCheckboxItem
                        key={c.id}
                        className='capitalize'
                        checked={c.getIsVisible()}
                        onCheckedChange={(v) => c.toggleVisibility(!!v)}
                      >
                        {c.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} className={cn(compact && 'h-9')}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type='button'
                          onClick={header.column.getToggleSortingHandler()}
                          className='hover:text-foreground inline-flex items-center gap-1 transition-colors'
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === 'asc' ? (
                            <ArrowUp className='size-3' />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className='size-3' />
                          ) : (
                            <ChevronsUpDown className='size-3 opacity-50' />
                          )}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(compact && 'py-2')}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='text-muted-foreground h-24 text-center'
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className='flex flex-col items-stretch gap-2 text-sm sm:flex-row sm:items-center sm:justify-between'>
        <div className='text-muted-foreground'>
          {manualPagination && typeof totalRows === 'number' ? (
            <>
              Page {resolvedPageIndex + 1} of {Math.max(1, resolvedPageCount)} ·{' '}
              {totalRows.toLocaleString()} total
            </>
          ) : (
            <>
              Showing {table.getRowModel().rows.length} of{' '}
              {table.getPrePaginationRowModel().rows.length}
            </>
          )}
        </div>
        <div className='flex items-center gap-2'>
          {onPageSizeChange && (
            <select
              value={resolvedPageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className='border-input bg-background h-8 rounded-md border px-2 text-sm'
              aria-label='Rows per page'
            >
              {[10, 25, 50, 100].map((s) => (
                <option key={s} value={s}>
                  {s} / page
                </option>
              ))}
            </select>
          )}
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              if (manualPagination) {
                onPageChange?.(Math.max(0, resolvedPageIndex - 1));
              } else {
                table.previousPage();
              }
            }}
            disabled={
              manualPagination
                ? resolvedPageIndex === 0
                : !table.getCanPreviousPage()
            }
          >
            <ChevronLeft className='size-4' />
            Prev
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              if (manualPagination) {
                onPageChange?.(resolvedPageIndex + 1);
              } else {
                table.nextPage();
              }
            }}
            disabled={
              manualPagination
                ? resolvedPageIndex + 1 >= resolvedPageCount
                : !table.getCanNextPage()
            }
          >
            Next
            <ChevronRight className='size-4' />
          </Button>
        </div>
      </div>
    </div>
  );
}
