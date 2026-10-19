'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Eye, UserMinus } from 'lucide-react';

import {
  canModerateTeams,
  getFormedTeamsForEvent,
} from '@/app/dashboard/admin/events/actions';
import type { FormedTeamRow } from '@/app/dashboard/admin/events/actions';
import { listEventSubmissions } from '@/app/dashboard/events/submission-actions';
import type { AdminSubmissionRow } from '@/app/dashboard/events/submission-actions';
import { removeMember } from '@/app/dashboard/events/team-actions';
import { DataTable } from '@/components/data-table/data-table';
import { LocalDateTime } from '@/components/local-date-time';
import { SubmissionStatusBadge } from '@/components/submissions/submission-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';

/**
 * One row per team: a formed team (with its roster, when the viewer can read
 * teams) and its project, if it has one. A team-of-one never shows up as a
 * formed team, so its project gets a row of its own.
 */
type TeamProjectRow = {
  key: string;
  team: FormedTeamRow | null;
  members: string[];
  project: AdminSubmissionRow | null;
};

function buildRows(
  teams: FormedTeamRow[],
  projects: AdminSubmissionRow[],
): TeamProjectRow[] {
  const projectByTeamId = new Map(projects.map((p) => [p.teamId, p]));
  const rows: TeamProjectRow[] = teams.map((team) => {
    const project = projectByTeamId.get(team.teamId) ?? null;
    projectByTeamId.delete(team.teamId);
    return {
      key: team.teamId,
      team,
      members: team.members.map((m) => m.name),
      project,
    };
  });
  for (const project of projectByTeamId.values()) {
    rows.push({
      key: project.teamId,
      team: null,
      members: project.members,
      project,
    });
  }
  return rows;
}

/**
 * Takes the event's uuid rather than the route's `params`: the `[eventId]`
 * segment may be the event's custom slug, and `page.tsx` resolves it on the
 * server so the team and project actions are keyed by the stored id. The
 * event's settings and which halves the viewer may see come from there too,
 * rather than from `getEventDetails`, which needs event:manage — more than
 * this page's own `team:read:all` / `submission:read:all`.
 */
export function TeamsPage({
  eventId,
  segment,
  showTeams,
  showProjects,
  maxTeamSize,
  submissionsCloseAt,
}: {
  eventId: string;
  /** The URL segment (slug or uuid), for links back to this page. */
  segment: string;
  showTeams: boolean;
  showProjects: boolean;
  maxTeamSize: number | null;
  submissionsCloseAt: Date | null;
}) {
  const [teamRows, setTeamRows] = React.useState<FormedTeamRow[]>([]);
  const [projectRows, setProjectRows] = React.useState<AdminSubmissionRow[]>(
    [],
  );
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

  // Each half is only queried when the viewer may see it — the actions
  // would otherwise redirect to /forbidden.
  const loadData = React.useCallback(async () => {
    const [teamsResult, projectsResult] = await Promise.all([
      showTeams ? getFormedTeamsForEvent(eventId) : null,
      showProjects ? listEventSubmissions(eventId) : null,
    ]);
    if (teamsResult && !teamsResult.success) {
      return {
        ok: false as const,
        error: teamsResult.error || 'Failed to load teams.',
      };
    }
    if (projectsResult && !projectsResult.success) {
      return {
        ok: false as const,
        error: projectsResult.error || 'Failed to load projects.',
      };
    }
    return {
      ok: true as const,
      teams: teamsResult?.data ?? [],
      projects: projectsResult?.data ?? [],
    };
  }, [eventId, showTeams, showProjects]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [data, moderate] = await Promise.all([
          loadData(),
          showTeams ? canModerateTeams() : false,
        ]);
        if (cancelled) return;

        setCanModerate(moderate);

        if (!data.ok) {
          setLoadError(data.error);
        } else {
          setTeamRows(data.teams);
          setProjectRows(data.projects);
          setLoadError(null);
        }
      } catch (error) {
        // Without this the awaited Promise.all rejects, `setLoading(false)`
        // never runs, and the tab sits on "Loading..." forever.
        console.error('[admin/events/teams] failed to load teams tab', error);
        if (!cancelled) setLoadError('Failed to load teams.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [loadData, showTeams, reloadToken]);

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

    // Refetch both: a team shrunk to one member drops out of the formed
    // teams, and its project's roster changes with it.
    const data = await loadData().catch(() => null);
    if (data?.ok) {
      setTeamRows(data.teams);
      setProjectRows(data.projects);
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

  const rows = React.useMemo(
    () => buildRows(teamRows, projectRows),
    [teamRows, projectRows],
  );

  const columns = React.useMemo<ColumnDef<TeamProjectRow>[]>(() => {
    const backHref = `/dashboard/admin/events/${segment}/teams`;
    const teamColumns: ColumnDef<TeamProjectRow>[] = [
      {
        id: 'team',
        header: 'Team',
        accessorFn: (row) => row.members.join(', '),
        cell: ({ row }) => {
          const { team, members } = row.original;
          return (
            <div className='whitespace-normal'>
              <p className='text-sm'>
                {members.length > 0
                  ? members.join(', ')
                  : 'No remaining members'}
              </p>
              {team && (
                <p className='text-muted-foreground text-xs'>
                  Led by {team.organizerName}
                  {team.organizerEmail ? ` · ${team.organizerEmail}` : ''}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: 'memberCount',
        header: 'Members',
        accessorFn: (row) => row.team?.memberCount ?? row.members.length,
        cell: ({ getValue }) => (
          <Badge variant='outline'>{getValue<number>()}</Badge>
        ),
      },
    ];
    const projectColumns: ColumnDef<TeamProjectRow>[] = [
      {
        id: 'project',
        header: 'Project',
        accessorFn: (row) => row.project?.title ?? '',
        cell: ({ row }) => {
          const { project } = row.original;
          if (!project) {
            return <span className='text-muted-foreground'>No project</span>;
          }
          return (
            <Link
              href={{
                pathname: `/dashboard/events/${segment}/projects/${project.id}`,
                query: { back: backHref },
              }}
              className='font-medium hover:underline'
            >
              {project.title}
            </Link>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) =>
          row.project ? (row.project.published ? 'Published' : 'Draft') : '',
        cell: ({ row }) =>
          row.original.project ? (
            <SubmissionStatusBadge published={row.original.project.published} />
          ) : null,
      },
      {
        id: 'updatedAt',
        header: 'Last edited',
        accessorFn: (row) => row.project?.updatedAt.getTime() ?? 0,
        enableGlobalFilter: false,
        cell: ({ row }) =>
          row.original.project ? (
            <span className='text-muted-foreground'>
              <LocalDateTime
                value={row.original.project.updatedAt}
                dateStyle='medium'
                timeStyle='short'
              />
            </span>
          ) : null,
      },
    ];
    const actionColumn: ColumnDef<TeamProjectRow> = {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const { team } = row.original;
        if (!team) return null;
        return (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={`View team led by ${team.organizerName}`}
            title='View team'
            onClick={() => {
              setSelectedTeam(team);
              setShowDetails(true);
            }}
          >
            <Eye className='size-4' />
          </Button>
        );
      },
    };
    return [
      ...(showProjects ? projectColumns.slice(0, 1) : []),
      ...teamColumns,
      ...(showProjects ? projectColumns.slice(1) : []),
      ...(showTeams ? [actionColumn] : []),
    ];
  }, [segment, showTeams, showProjects]);

  if (!showTeams && !showProjects) {
    return (
      <div className='text-muted-foreground py-8 text-center'>
        Teams and projects are not enabled for this event.
      </div>
    );
  }

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

  const publishedCount = projectRows.filter((p) => p.published).length;

  return (
    <Card className='space-y-4 p-6'>
      <div>
        <h2 className='text-lg font-semibold'>
          {showTeams && showProjects
            ? 'Teams & projects'
            : showTeams
              ? 'Teams'
              : 'Projects'}
        </h2>
        {showTeams && (
          <p className='text-muted-foreground mt-1 text-sm'>
            {teamRows.length} formed team{teamRows.length !== 1 ? 's' : ''}
            {maxTeamSize != null ? ` · max size ${maxTeamSize}` : ''}
          </p>
        )}
        {showProjects && (
          <p className='text-muted-foreground mt-1 text-sm'>
            {publishedCount} published project
            {publishedCount !== 1 ? 's' : ''} ·{' '}
            {projectRows.length - publishedCount} still draft
            {projectRows.length - publishedCount !== 1 ? 's' : ''}
            {submissionsCloseAt && (
              <>
                {' · '}submissions close{' '}
                <LocalDateTime
                  value={submissionsCloseAt}
                  dateStyle='medium'
                  timeStyle='short'
                  timeZoneName='short'
                />
                . Drafts at the deadline won&apos;t be judged.
              </>
            )}
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder={
          showProjects ? 'Search teams and projects...' : 'Search teams...'
        }
        emptyMessage={
          showTeams
            ? 'No formed teams yet.'
            : 'No team has started a project yet.'
        }
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
    </Card>
  );
}
