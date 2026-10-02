'use client';

/**
 * Per-column filter for `DataTable`'s `enableColumnFilters` mode: a small
 * funnel button in each filterable header that opens a text, multi-select,
 * or date-range filter depending on the column's `meta.filterVariant`.
 */

import * as React from 'react';
import { Check, Filter } from 'lucide-react';
import type { Column, FilterFn, RowData } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { fromDateTimeLocalValue } from '@/lib/datetime';
import { cn } from '@/lib/utils';

export type ColumnFilterOption = { label: string; value: string };

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Filter UI for this column. Defaults to `text`. */
    filterVariant?: 'text' | 'select' | 'date';
    /**
     * Choices for a `select` filter. Omitted, they're derived from the
     * column's distinct values — fine for short labels like a status, but
     * pass them explicitly when the raw value isn't what a reader recognizes
     * (an option id) or can be an array.
     */
    filterOptions?: ColumnFilterOption[];
  }
}

/** Stands in for a null/undefined/empty cell in a `select` filter. */
export const EMPTY_FILTER_VALUE = '__empty__';

type DateRangeFilter = { from?: string; to?: string };

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * The filter function `enableColumnFilters` installs as every column's
 * default. It dispatches on the filter value's shape — which is set by the
 * column's variant — so a column doesn't need its own `filterFn` unless its
 * accessor value isn't what the filter should compare against.
 *
 * - string: case-insensitive "contains" on the cell value
 * - string[]: the cell value (or, for an array cell, any element) is one of them
 * - { from, to }: a Date cell falls within those viewer-local calendar days
 */
export const columnFilterFn: FilterFn<unknown> = (row, columnId, filter) => {
  const value = row.getValue(columnId);

  if (typeof filter === 'string') {
    if (!filter) return true;
    if (isEmptyValue(value)) return false;
    const haystack = Array.isArray(value)
      ? value.map(String).join(' ')
      : String(value);
    return haystack.toLowerCase().includes(filter.toLowerCase());
  }

  if (Array.isArray(filter)) {
    if (filter.length === 0) return true;
    if (isEmptyValue(value)) return filter.includes(EMPTY_FILTER_VALUE);
    const values = Array.isArray(value) ? value : [value];
    return values.some((v) => filter.includes(String(v)));
  }

  if (filter && typeof filter === 'object') {
    const { from, to } = filter as DateRangeFilter;
    if (!(value instanceof Date)) return !from && !to;
    // `<input type="date">` days are the viewer's own calendar days, so the
    // boundaries are resolved in the browser's zone — this only ever runs
    // client-side, against instants the server already sent as UTC.
    const start = from ? fromDateTimeLocalValue(`${from}T00:00`) : null;
    const endDay = to ? fromDateTimeLocalValue(`${to}T00:00`) : null;
    if (start && value < start) return false;
    if (endDay) {
      const end = new Date(endDay);
      end.setDate(end.getDate() + 1);
      if (value >= end) return false;
    }
    return true;
  }

  return true;
};

function deriveOptions<TData>(column: Column<TData>): ColumnFilterOption[] {
  const options: ColumnFilterOption[] = [];
  let hasEmpty = false;
  for (const key of column.getFacetedUniqueValues().keys()) {
    if (isEmptyValue(key)) {
      hasEmpty = true;
      continue;
    }
    options.push({ label: String(key), value: String(key) });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  if (hasEmpty) options.push({ label: '(Empty)', value: EMPTY_FILTER_VALUE });
  return options;
}

function headerTitle<TData>(column: Column<TData>): string {
  const header = column.columnDef.header;
  return typeof header === 'string' ? header : column.id;
}

export function DataTableColumnFilter<TData>({
  column,
}: {
  column: Column<TData>;
}) {
  const variant = column.columnDef.meta?.filterVariant ?? 'text';
  const isActive = column.getIsFiltered();
  const title = headerTitle(column);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className={cn(
            'size-6',
            isActive
              ? 'text-primary'
              : 'text-muted-foreground opacity-50 hover:opacity-100',
          )}
          aria-label={`Filter ${title}`}
          title={`Filter ${title}`}
        >
          <Filter className={cn('size-3', isActive && 'fill-current')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className={cn(variant === 'select' ? 'w-60 p-0' : 'w-64 p-3')}
      >
        {variant === 'select' ? (
          <SelectFilter column={column} title={title} />
        ) : variant === 'date' ? (
          <DateFilter column={column} />
        ) : (
          <TextFilter column={column} title={title} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function TextFilter<TData>({
  column,
  title,
}: {
  column: Column<TData>;
  title: string;
}) {
  const value = (column.getFilterValue() as string | undefined) ?? '';
  return (
    <div className='flex items-center gap-2'>
      <Input
        autoFocus
        placeholder={`Filter ${title.toLowerCase()}…`}
        value={value}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
        className='h-8'
      />
      {value && (
        <Button
          variant='ghost'
          size='sm'
          className='h-8'
          onClick={() => column.setFilterValue(undefined)}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function SelectFilter<TData>({
  column,
  title,
}: {
  column: Column<TData>;
  title: string;
}) {
  const explicitOptions = column.columnDef.meta?.filterOptions;
  const facets = column.getFacetedUniqueValues();
  const options = React.useMemo(
    () => explicitOptions ?? deriveOptions(column),
    // `facets` is the real dependency of the derived list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [explicitOptions, facets],
  );
  const selected = new Set(
    (column.getFilterValue() as string[] | undefined) ?? [],
  );

  return (
    <Command>
      <CommandInput placeholder={title} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const isSelected = selected.has(option.value);
            return (
              <CommandItem
                key={option.value}
                value={`${option.label} ${option.value}`}
                onSelect={() => {
                  if (isSelected) selected.delete(option.value);
                  else selected.add(option.value);
                  const values = Array.from(selected);
                  column.setFilterValue(values.length ? values : undefined);
                }}
              >
                <div
                  className={cn(
                    'border-primary flex size-4 items-center justify-center rounded-sm border',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'opacity-50 [&_svg]:invisible',
                  )}
                >
                  <Check className='size-3' />
                </div>
                <span className='truncate'>{option.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {selected.size > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => column.setFilterValue(undefined)}
                className='justify-center text-center'
              >
                Clear filter
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}

function DateFilter<TData>({ column }: { column: Column<TData> }) {
  const value = (column.getFilterValue() as DateRangeFilter | undefined) ?? {};
  const id = React.useId();

  function update(next: DateRangeFilter) {
    column.setFilterValue(next.from || next.to ? next : undefined);
  }

  return (
    <div className='space-y-3'>
      <div className='space-y-1'>
        <Label htmlFor={`${id}-from`}>From</Label>
        <Input
          id={`${id}-from`}
          type='date'
          value={value.from ?? ''}
          max={value.to}
          onChange={(e) => update({ ...value, from: e.target.value })}
          className='h-8'
        />
      </div>
      <div className='space-y-1'>
        <Label htmlFor={`${id}-to`}>To</Label>
        <Input
          id={`${id}-to`}
          type='date'
          value={value.to ?? ''}
          min={value.from}
          onChange={(e) => update({ ...value, to: e.target.value })}
          className='h-8'
        />
      </div>
      {(value.from || value.to) && (
        <Button
          variant='ghost'
          size='sm'
          className='w-full'
          onClick={() => column.setFilterValue(undefined)}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
