'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { LocalDateTime } from '@/components/local-date-time';
import { DataTable } from '@/components/data-table/data-table';
import type { AdminAttendeeRow } from '@/lib/admin-event';

/** Roster for an event with no application form — plain signups. */
export function AttendeesTable({ rows }: { rows: AdminAttendeeRow[] }) {
  const columns = React.useMemo<ColumnDef<AdminAttendeeRow>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Attendee',
        cell: ({ row }) => (
          <div className='min-w-0'>
            <div className='font-medium'>{row.original.fullName}</div>
            <div className='text-muted-foreground text-xs'>
              {row.original.email}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'registeredAt',
        header: 'Registered',
        cell: ({ row }) => (
          <LocalDateTime value={row.original.registeredAt} dateStyle='medium' />
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder='Search attendees…'
      emptyMessage='No one has registered yet.'
      compact
      initialSorting={[{ id: 'registeredAt', desc: true }]}
    />
  );
}
