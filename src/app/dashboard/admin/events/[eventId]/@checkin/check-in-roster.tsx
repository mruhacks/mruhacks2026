'use client';

import * as React from 'react';
import { Undo2, UserCheck } from 'lucide-react';

import type { CheckInRosterRow } from '@/app/dashboard/admin/events/check-in-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RosterFilter = 'all' | 'waiting' | 'arrived';

const PAGE_SIZE = 40;

function formatTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: 'short',
  }).format(new Date(value));
}

type CheckInRosterProps = {
  rows: CheckInRosterRow[];
  pendingUserId: string | null;
  onCheckIn: (row: CheckInRosterRow) => void;
  onUndo: (row: CheckInRosterRow) => void;
};

export function CheckInRoster({
  rows,
  pendingUserId,
  onCheckIn,
  onUndo,
}: CheckInRosterProps) {
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<RosterFilter>('all');
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  const arrivedCount = rows.filter((row) => row.checkedInAt).length;

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (filter === 'waiting' && row.checkedInAt) return false;
        if (filter === 'arrived' && !row.checkedInAt) return false;
        if (!needle) return true;
        return (
          row.name.toLowerCase().includes(needle) ||
          row.email.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, query, filter]);

  const filters: { id: RosterFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Everyone', count: rows.length },
    { id: 'waiting', label: 'Not in', count: rows.length - arrivedCount },
    { id: 'arrived', label: 'Checked in', count: arrivedCount },
  ];

  return (
    <div className='space-y-3'>
      <Input
        type='search'
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setVisible(PAGE_SIZE);
        }}
        placeholder='Search name or email'
        autoCapitalize='none'
        autoCorrect='off'
        spellCheck={false}
        className='h-11 text-base sm:h-9 sm:max-w-xs sm:text-sm'
      />

      <div className='no-scrollbar flex gap-2 overflow-x-auto'>
        {filters.map((option) => (
          <Button
            key={option.id}
            type='button'
            size='sm'
            variant={filter === option.id ? 'default' : 'outline'}
            className='h-9'
            onClick={() => {
              setFilter(option.id);
              setVisible(PAGE_SIZE);
            }}
          >
            {option.label}
            <span className='tabular-nums opacity-70'>{option.count}</span>
          </Button>
        ))}
      </div>

      {matches.length === 0 ? (
        <p className='text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm'>
          {rows.length === 0
            ? 'Nobody is registered for this event yet.'
            : 'No one matches that search.'}
        </p>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {matches.slice(0, visible).map((row) => (
            <RosterRow
              key={row.userId}
              row={row}
              pending={pendingUserId === row.userId}
              onCheckIn={onCheckIn}
              onUndo={onUndo}
            />
          ))}
        </ul>
      )}

      {matches.length > visible && (
        <Button
          type='button'
          variant='outline'
          className='h-11 w-full sm:h-9'
          onClick={() => setVisible((shown) => shown + PAGE_SIZE)}
        >
          Show more ({matches.length - visible} left)
        </Button>
      )}
    </div>
  );
}

type RosterRowProps = {
  row: CheckInRosterRow;
  pending: boolean;
  onCheckIn: (row: CheckInRosterRow) => void;
  onUndo: (row: CheckInRosterRow) => void;
};

function RosterRow({ row, pending, onCheckIn, onUndo }: RosterRowProps) {
  return (
    <li className='flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4'>
      <div className='min-w-0'>
        <p className='truncate font-medium'>{row.name}</p>
        <p className='text-muted-foreground truncate text-sm'>{row.email}</p>
      </div>

      <div className='flex items-center justify-between gap-3 sm:justify-end'>
        {row.checkedInAt ? (
          <div className='flex min-w-0 flex-col gap-0.5'>
            <Badge variant='default' className='w-fit'>
              In at {formatTime(row.checkedInAt)}
            </Badge>
            {row.checkedInByName && (
              <span className='text-muted-foreground truncate text-xs'>
                by {row.checkedInByName}
              </span>
            )}
          </div>
        ) : (
          <Badge variant='outline' className='w-fit'>
            Not checked in
          </Badge>
        )}

        {row.checkedInAt ? (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-10 shrink-0 sm:h-8'
            disabled={pending}
            onClick={() => onUndo(row)}
          >
            <Undo2 className='size-4' />
            Undo
          </Button>
        ) : (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-10 shrink-0 sm:h-8'
            disabled={pending}
            onClick={() => onCheckIn(row)}
          >
            <UserCheck className='size-4' />
            Check in
          </Button>
        )}
      </div>
    </li>
  );
}
