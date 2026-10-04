'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Eye, UserMinus } from 'lucide-react';

import {
  canModerateTeams,
  getFormedTeamsForEvent,
} from '@/app/dashboard/admin/events/actions';
import type { FormedTeamRow } from '@/app/dashboard/admin/events/actions';
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

/**
 * Takes the event's uuid rather than the route's `params`: the `[eventId]`
 * segment may be the event's custom slug, and `page.tsx` resolves it on the
 * server so the team actions are keyed by the stored id. The event's team
 * settings come from there too, rather than from `getEventDetails`, which
 * needs event:manage — more than this page's own `team:read:all`.
 */
export function TeamsPage({
  eventId,
  teamsEnabled,
  maxTeamSize,
}: {
  eventId: string;
  teamsEnabled: boolean;
  maxTeamSize: number | null;
}) {
  const [teamRows, setTeamRows] = React.useState<FormedTeamRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [canModerate, setCanModerate] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [selectedTeam, setSelectedTeam] = React.useState<FormedTeamRow | null>(
    null,
  );
  const [showDetails, setShowDetails] = React.useState(false);
  const [removingUserId, setRemovingUserId] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [teamsResult, moderate] = await Promise.all([
          getFormedTeamsForEvent(eventId),
          canModerateTeams(),
        ]);
        if (cancelled) return;

        setCanModerate(moderate);

        if (teamsResult.success && teamsResult.data) {
          setTeamRows(teamsResult.data);
          setLoadError(null);
        } else if (!teamsResult.success) {
          setLoadError(teamsResult.error || 'Failed to load teams');
        }
      } catch (error) {
        // Without this the awaited Promise.all rejects, `setLoading(false)`
        // never runs, and the tab sits on "Loading..." forever.
        console.error('Failed to load teams tab:', error);
        if (!cancelled) setLoadError('Failed to load teams.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadToken]);

  const handleRemove = async (teamId: string, targetUserId: string) => {
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

  if (loadError) {
    return (
      <div className='space-y-3 py-8 text-center'>
        <p className='text-destructive text-sm'>{loadError}</p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => {
            setLoading(true);
            setLoadError(null);
            setReloadToken((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (!teamsEnabled) {
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
          {maxTeamSize != null ? ` · max size ${maxTeamSize}` : ''}
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
                    {canModerate && (
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
