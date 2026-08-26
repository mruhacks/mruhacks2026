'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Eye, UserMinus } from 'lucide-react';

import {
  getEventDetails,
  getFormedTeamsForEvent,
} from '@/app/dashboard/admin/events/actions';
import type {
  EventDetails,
  FormedTeamRow,
} from '@/app/dashboard/admin/events/actions';
import { removeMember } from '@/app/dashboard/events/team-actions';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type TeamsPageProps = {
  params: Promise<{ eventId: string }>;
};

export default function TeamsPage({ params }: TeamsPageProps) {
  const [eventId, setEventId] = React.useState<string | null>(null);
  const [event, setEvent] = React.useState<EventDetails | null>(null);
  const [teamRows, setTeamRows] = React.useState<FormedTeamRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedTeam, setSelectedTeam] = React.useState<FormedTeamRow | null>(
    null,
  );
  const [showDetails, setShowDetails] = React.useState(false);
  const [removingUserId, setRemovingUserId] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    params.then((p) => setEventId(p.eventId));
  }, [params]);

  React.useEffect(() => {
    if (!eventId) return;

    async function fetchData() {
      const [eventResult, teamsResult] = await Promise.all([
        getEventDetails(eventId as string),
        getFormedTeamsForEvent(eventId as string),
      ]);

      if (eventResult.success && eventResult.data) {
        setEvent(eventResult.data);
      } else if (!eventResult.success) {
        toast.error(eventResult.error || 'Failed to load event');
      }

      if (teamsResult.success && teamsResult.data) {
        setTeamRows(teamsResult.data);
      } else if (!teamsResult.success) {
        toast.error(teamsResult.error || 'Failed to load teams');
      }

      setLoading(false);
    }

    fetchData();
  }, [eventId]);

  const handleRemove = async (teamId: string, targetUserId: string) => {
    if (!eventId) return;
    setRemovingUserId(targetUserId);
    const result = await removeMember(eventId, targetUserId);
    setRemovingUserId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(
      typeof result.data === 'string' ? result.data : 'Member removed.',
    );

    const teamsResult = await getFormedTeamsForEvent(eventId);
    if (teamsResult.success && teamsResult.data) {
      setTeamRows(teamsResult.data);
    }
    setSelectedTeam((prev) =>
      prev && prev.teamId === teamId
        ? {
            ...prev,
            members: prev.members.filter((m) => m.userId !== targetUserId),
            memberCount: prev.memberCount - 1,
          }
        : prev,
    );
  };

  const columns = React.useMemo<ColumnDef<FormedTeamRow>[]>(
    () => [
      {
        accessorKey: 'organizerName',
        header: 'Organizer',
        cell: ({ row }) => (
          <div>
            <p className='font-medium'>{row.original.organizerName}</p>
            <p className='text-muted-foreground text-xs'>
              {row.original.organizerEmail}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'members',
        header: 'Members',
        cell: ({ row }) => (
          <span className='text-sm'>
            {row.original.members.map((m) => m.name).join(', ')}
          </span>
        ),
      },
      {
        accessorKey: 'memberCount',
        header: 'Member Count',
        cell: ({ row }) => (
          <Badge variant='outline'>{row.original.memberCount}</Badge>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={`View team led by ${row.original.organizerName}`}
            title='View team'
            onClick={() => {
              setSelectedTeam(row.original);
              setShowDetails(true);
            }}
          >
            <Eye className='size-4' />
          </Button>
        ),
      },
    ],
    [],
  );

  if (loading) {
    return (
      <div className='text-muted-foreground py-8 text-center'>Loading...</div>
    );
  }

  if (event && !event.teamsEnabled) {
    return (
      <div className='text-muted-foreground py-8 text-center'>
        Teams are not enabled for this event.
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div>
        <h2 className='text-lg font-semibold'>Teams</h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {teamRows.length} formed team{teamRows.length !== 1 ? 's' : ''}
          {event?.maxTeamSize != null ? ` · max size ${event.maxTeamSize}` : ''}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={teamRows}
        searchPlaceholder='Search teams...'
        emptyMessage='No formed teams yet.'
        initialSorting={[{ id: 'memberCount', desc: true }]}
      />

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className='max-h-[90vh] max-w-lg overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Team roster</DialogTitle>
            <DialogDescription>
              Led by {selectedTeam?.organizerName}
            </DialogDescription>
          </DialogHeader>

          {selectedTeam && (
            <ul className='space-y-2'>
              {selectedTeam.members.map((member) => (
                <li
                  key={member.userId}
                  className='flex items-center justify-between gap-2 rounded-md border p-2'
                >
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>
                      {member.name}
                    </p>
                    <p className='text-muted-foreground truncate text-xs'>
                      {member.email}
                    </p>
                  </div>
                  <div className='flex shrink-0 items-center gap-2'>
                    {member.isOrganizer && (
                      <Badge variant='outline'>Organizer</Badge>
                    )}
                    {!member.isOrganizer && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label={`Remove ${member.name}`}
                        disabled={removingUserId === member.userId}
                        onClick={() =>
                          handleRemove(selectedTeam.teamId, member.userId)
                        }
                      >
                        <UserMinus className='size-4' />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
