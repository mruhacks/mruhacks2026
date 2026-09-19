'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import type {
  AdminRsvpParticipant,
  AdminRsvpWaveSummary,
} from '@/app/dashboard/admin/events/actions';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableFacetedFilter } from '@/components/data-table/data-table-faceted-filter';
import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { rsvpStatusFilterFn } from '@/lib/rsvp/rsvp-status-filter';
import { rsvpStatusDisplayList, type RsvpStatus } from '@/types/lookups';

const RSVP_DISPLAY = Object.fromEntries(
  rsvpStatusDisplayList.map((item) => [item.label, item]),
) as Record<RsvpStatus, (typeof rsvpStatusDisplayList)[number]>;

const STATUS_FILTER_OPTIONS: { label: string; value: RsvpStatus }[] = [
  { label: 'Waiting', value: 'pending' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Declined', value: 'declined' },
  { label: 'Timed out', value: 'timed_out' },
];

function StatusBadge({ status }: { status: RsvpStatus }) {
  const display = RSVP_DISPLAY[status];
  return <Badge variant={display.variant}>{display.title}</Badge>;
}

function ParticipantTiming({
  participant,
  respondBy,
}: {
  participant: AdminRsvpParticipant;
  respondBy: Date | string;
}) {
  if (participant.statusLabel === 'pending') {
    return (
      <>
        Respond by{' '}
        <LocalDateTime value={respondBy} dateStyle='medium' timeStyle='short' />
      </>
    );
  }

  if (
    (participant.statusLabel === 'accepted' ||
      participant.statusLabel === 'declined') &&
    participant.respondedAt
  ) {
    return (
      <>
        Responded{' '}
        <LocalDateTime
          value={participant.respondedAt}
          dateStyle='medium'
          timeStyle='short'
        />
      </>
    );
  }

  if (participant.statusLabel === 'timed_out') {
    return 'Did not respond before expiry';
  }

  return '—';
}

function timingSortValue(participant: AdminRsvpParticipant): number {
  if (!participant.respondedAt) return 0;
  const date =
    participant.respondedAt instanceof Date
      ? participant.respondedAt
      : new Date(participant.respondedAt);
  return date.getTime();
}

type Props = {
  wave: AdminRsvpWaveSummary;
};

export function RsvpParticipantsTable({ wave }: Props) {
  const columns = React.useMemo<ColumnDef<AdminRsvpParticipant>[]>(
    () => [
      {
        id: 'applicant',
        accessorFn: (row) => `${row.name} ${row.email}`,
        header: 'Applicant',
        cell: ({ row }) => (
          <div className='flex flex-col'>
            <span className='font-medium'>{row.original.name}</span>
            <span className='text-muted-foreground text-xs'>
              {row.original.email}
            </span>
          </div>
        ),
      },
      {
        id: 'status',
        accessorKey: 'statusLabel',
        header: 'Status',
        filterFn: rsvpStatusFilterFn,
        cell: ({ row }) => <StatusBadge status={row.original.statusLabel} />,
      },
      {
        id: 'timing',
        accessorFn: (row) => timingSortValue(row),
        header: 'Timing',
        enableColumnFilter: false,
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            <ParticipantTiming
              participant={row.original}
              respondBy={wave.respondBy}
            />
          </span>
        ),
      },
    ],
    [wave.respondBy],
  );

  return (
    <DataTable
      columns={columns}
      data={wave.participants}
      searchPlaceholder='Search applicants...'
      emptyMessage={
        wave.participants.length === 0
          ? 'No invitation records for this wave.'
          : 'No matching participants.'
      }
      pageSize={10}
      initialSorting={[{ id: 'applicant', desc: false }]}
      toolbarRight={(table) => (
        <DataTableFacetedFilter
          column={table.getColumn('status')}
          title='Status'
          options={STATUS_FILTER_OPTIONS}
        />
      )}
    />
  );
}
