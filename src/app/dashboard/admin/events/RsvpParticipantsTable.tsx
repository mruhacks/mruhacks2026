'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

import {
  resendRsvpInvitation,
  type AdminRsvpParticipant,
  type AdminRsvpWaveSummary,
  type RsvpInvitationEmailStatus,
} from '@/app/dashboard/admin/events/actions';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableFacetedFilter } from '@/components/data-table/data-table-faceted-filter';
import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { rsvpStatusFilterFn } from '@/lib/rsvp/rsvp-status-filter';
import {
  STATIC_STATUS_DISPLAY,
  type InvitationStatus,
} from '@/lib/participation/status';

const STATUS_FILTER_OPTIONS: { label: string; value: InvitationStatus }[] = [
  { label: 'Waiting', value: 'invited' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Declined', value: 'declined' },
  { label: 'Timed out', value: 'timed_out' },
];

const DELIVERY_FILTER_OPTIONS: {
  label: string;
  value: RsvpInvitationEmailStatus;
}[] = [{ label: 'Delivery failed', value: 'failed' }];

function StatusBadge({ status }: { status: InvitationStatus }) {
  const display = STATIC_STATUS_DISPLAY[status];
  return <Badge variant={display.variant}>{display.title}</Badge>;
}

function DeliveryBadge({ status }: { status: RsvpInvitationEmailStatus }) {
  if (status === 'failed') {
    return <Badge variant='destructive'>Delivery failed</Badge>;
  }
  if (status === 'queued') {
    return <Badge variant='outline'>Queued</Badge>;
  }
  if (status === 'sent') {
    return <Badge variant='outline'>Sent</Badge>;
  }
  return <span className='text-muted-foreground'>—</span>;
}

function ResendButton({
  eventId,
  participant,
  hasResent,
  onResent,
}: {
  eventId: string;
  participant: AdminRsvpParticipant;
  /** Already resent this session — session-local, not persisted past a reload. */
  hasResent: boolean;
  onResent: (responseId: string) => void;
}) {
  const [isSending, setIsSending] = React.useState(false);

  if (participant.statusLabel !== 'invited') {
    return null;
  }

  async function handleClick() {
    if (isSending || hasResent) return;
    setIsSending(true);
    try {
      const result = await resendRsvpInvitation(eventId, participant.userId);
      if (!result.success) {
        toast.error(result.error || 'Failed to resend RSVP invitation');
        return;
      }
      toast.success(`Invitation resent to ${participant.email}.`);
      // Update this row in place — no need to reload the whole RSVP summary
      // (and its loading state) just to reflect one row's delivery status.
      onResent(participant.responseId);
    } catch {
      toast.error('Failed to resend RSVP invitation');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      disabled={isSending || hasResent}
      onClick={handleClick}
    >
      {hasResent ? 'Resent' : isSending ? 'Resending…' : 'Resend'}
    </Button>
  );
}

function ParticipantTiming({
  participant,
  respondBy,
}: {
  participant: AdminRsvpParticipant;
  respondBy: Date | string;
}) {
  if (participant.statusLabel === 'invited') {
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
  eventId: string;
  wave: AdminRsvpWaveSummary;
  /** Viewer holds `event:manage:all`, which `resendRsvpInvitation` checks. */
  canResend: boolean;
};

export function RsvpParticipantsTable({ eventId, wave, canResend }: Props) {
  // Resend only ever flips a row to 'sent' — applied locally so a resend
  // doesn't have to trigger a full summary refetch (and its loading state)
  // just to reflect one row's delivery status.
  const [sentOverrides, setSentOverrides] = React.useState<ReadonlySet<string>>(
    new Set(),
  );
  const handleResent = React.useCallback((responseId: string) => {
    setSentOverrides((current) => new Set(current).add(responseId));
  }, []);

  const data = React.useMemo(
    () =>
      sentOverrides.size === 0
        ? wave.participants
        : wave.participants.map((participant) =>
            sentOverrides.has(participant.responseId)
              ? { ...participant, invitationEmailStatus: 'sent' as const }
              : participant,
          ),
    [wave.participants, sentOverrides],
  );

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
      {
        id: 'termsAcceptedAt',
        accessorFn: (row) =>
          row.termsAcceptedAt ? new Date(row.termsAcceptedAt).getTime() : 0,
        header: 'Event Terms consent',
        enableColumnFilter: false,
        cell: ({ row }) =>
          row.original.termsAcceptedAt ? (
            <LocalDateTime
              value={row.original.termsAcceptedAt}
              dateStyle='medium'
              timeStyle='short'
            />
          ) : (
            '—'
          ),
      },
      {
        id: 'delivery',
        accessorKey: 'invitationEmailStatus',
        header: 'Invitation',
        filterFn: rsvpStatusFilterFn,
        cell: ({ row }) => (
          <DeliveryBadge status={row.original.invitationEmailStatus} />
        ),
      },
      ...(canResend
        ? [
            {
              id: 'actions',
              header: '',
              enableColumnFilter: false,
              enableSorting: false,
              cell: ({ row }) => (
                <ResendButton
                  eventId={eventId}
                  participant={row.original}
                  hasResent={sentOverrides.has(row.original.responseId)}
                  onResent={handleResent}
                />
              ),
            } satisfies ColumnDef<AdminRsvpParticipant>,
          ]
        : []),
    ],
    [canResend, eventId, handleResent, sentOverrides, wave.respondBy],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder='Search applicants...'
      emptyMessage={
        wave.participants.length === 0
          ? 'No invitation records for this wave.'
          : 'No matching participants.'
      }
      pageSize={10}
      initialSorting={[{ id: 'applicant', desc: false }]}
      toolbarRight={(table) => (
        <>
          <DataTableFacetedFilter
            column={table.getColumn('status')}
            title='Status'
            options={STATUS_FILTER_OPTIONS}
          />
          <DataTableFacetedFilter
            column={table.getColumn('delivery')}
            title='Invitation'
            options={DELIVERY_FILTER_OPTIONS}
          />
        </>
      )}
    />
  );
}
