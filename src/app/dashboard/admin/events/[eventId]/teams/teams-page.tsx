'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Ban, Eye, MoreHorizontal, RotateCcw, UserMinus } from 'lucide-react';

import { canModerateTeams, getFormedTeamsForEvent } from '@/app/dashboard/admin/events/actions';
import type { FormedTeamRow } from '@/app/dashboard/admin/events/actions';
import {
  getJudgingProjects,
  setSubmissionDeactivated,
  type JudgingProjectRow,
} from '@/app/dashboard/admin/events/judging-actions';
import { listEventSubmissions } from '@/app/dashboard/events/submission-actions';
import type { AdminSubmissionRow } from '@/app/dashboard/events/submission-actions';
import { removeMember } from '@/app/dashboard/events/team-actions';
import { DataTable } from '@/components/data-table/data-table';
import { LocalDateTime } from '@/components/local-date-time';
import { SubmissionStatusBadge } from '@/components/submissions/submission-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { Card } from '@/components/ui/card';

/**
 * `checkedIn` is null when it isn't known: a project-only row carries just
 * its members' names.
 */
type RosterName = { name: string; checkedIn: boolean | null };

/**
 * A project as this page shows it: the submission itself (with
 * `submission:read:all`) joined to its expo table and judging state (with
 * `judging:manage:all`). Either half may be missing.
 */
type ProjectInfo = {
  id: string;
  teamId: string;
  title: string;
  published: boolean;
  /** Null when only the judging half was loaded. */
  updatedAt: Date | null;
  members: string[];
  /** Sort key; null for a project that has never been published. */
  tableSlot: number | null;
  tableLabel: string | null;
  deactivated: boolean;
};

function mergeProjects(submissions: AdminSubmissionRow[] | null, judging: JudgingProjectRow[] | null): ProjectInfo[] {
  const judgingById = new Map((judging ?? []).map((j) => [j.id, j]));
  if (submissions) {
    return submissions.map((sub) => {
      const j = judgingById.get(sub.id);
      return {
        id: sub.id,
        teamId: sub.teamId,
        title: sub.title,
        published: sub.published,
        updatedAt: sub.updatedAt,
        members: sub.members,
        tableSlot: j?.tableSlot ?? null,
        tableLabel: j?.tableLabel ?? null,
        deactivated: j?.deactivated ?? false,
      };
    });
  }
  return (judging ?? []).map((j) => ({
    id: j.id,
    teamId: j.teamId,
    title: j.title,
    published: j.published,
    updatedAt: null,
    members: [],
    tableSlot: j.tableSlot,
    tableLabel: j.tableLabel,
    deactivated: j.deactivated,
  }));
}

/**
 * One row per team: a formed team (with its roster, when the viewer can read
 * teams) and its project, if it has one. A team-of-one never shows up as a
 * formed team, so its project gets a row of its own.
 */
type TeamProjectRow = {
  key: string;
  team: FormedTeamRow | null;
  members: RosterName[];
  project: ProjectInfo | null;
};

const NOT_CHECKED_IN_CLASS = 'decoration-destructive underline';

function buildRows(teams: FormedTeamRow[], projects: ProjectInfo[]): TeamProjectRow[] {
  const projectByTeamId = new Map(projects.map((p) => [p.teamId, p]));
  const rows: TeamProjectRow[] = teams.map((team) => {
    const project = projectByTeamId.get(team.teamId) ?? null;
    projectByTeamId.delete(team.teamId);
    return {
      key: team.teamId,
      team,
      members: team.members.map((m) => ({
        name: m.name,
        checkedIn: m.checkedIn,
      })),
      project,
    };
  });
  for (const project of projectByTeamId.values()) {
    rows.push({
      key: project.teamId,
      team: null,
      members: project.members.map((name) => ({ name, checkedIn: null })),
      project,
    });
  }
  return rows;
}

/**
 * Takes the event's uuid rather than the route's `params`: the `[eventId]`
 * segment may be the event's custom slug, and `page.tsx` resolves it on the
 * server so the team and project actions are keyed by the stored id. The
 * event's settings and which parts the viewer may see come from there too,
 * rather than from `getEventDetails`, which needs event:manage — more than
 * this page's own `team:read:all` / `submission:read:all` /
 * `judging:manage:all`.
 */
export function TeamsPage({
  eventId,
  segment,
  showTeams,
  showProjects,
  showJudging,
  maxTeamSize,
}: {
  eventId: string;
  /** The URL segment (slug or uuid), for links back to this page. */
  segment: string;
  showTeams: boolean;
  /** `submission:read:all`: rosters, last-edited times and project links. */
  showProjects: boolean;
  /** `judging:manage:all`: expo tables and deactivating a project. */
  showJudging: boolean;
  maxTeamSize: number | null;
}) {
  const [teamRows, setTeamRows] = React.useState<FormedTeamRow[]>([]);
  const [projectRows, setProjectRows] = React.useState<ProjectInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [canModerate, setCanModerate] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [selectedTeam, setSelectedTeam] = React.useState<FormedTeamRow | null>(null);
  const [showDetails, setShowDetails] = React.useState(false);
  const [removingUserId, setRemovingUserId] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const showProjectColumns = showProjects || showJudging;

  // Each half is only queried when the viewer may see it — the actions
  // would otherwise redirect to /forbidden.
  const loadData = React.useCallback(async () => {
    const [teamsResult, projectsResult, judgingResult] = await Promise.all([
      showTeams ? getFormedTeamsForEvent(eventId) : null,
      showProjects ? listEventSubmissions(eventId) : null,
      showJudging ? getJudgingProjects(eventId) : null,
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
    if (judgingResult && !judgingResult.success) {
      return {
        ok: false as const,
        error: judgingResult.error || 'Failed to load expo tables.',
      };
    }
    return {
      ok: true as const,
      teams: teamsResult?.data ?? [],
      projects: mergeProjects(projectsResult?.data ?? null, judgingResult?.data ?? null),
    };
  }, [eventId, showTeams, showProjects, showJudging]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [data, moderate] = await Promise.all([loadData(), showTeams ? canModerateTeams() : false]);
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
    toast.success(typeof result.data === 'string' ? result.data : 'Member removed.');

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

  // Deactivating (team left, disqualified) takes a project out of judging
  // dispatch and results while keeping its votes and its table.
  const handleToggleDeactivated = React.useCallback(
    async (project: ProjectInfo) => {
      setTogglingId(project.id);
      try {
        const result = await setSubmissionDeactivated(eventId, project.id, !project.deactivated);
        // A button-only action: nothing to anchor an inline error to.
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        const data = await loadData().catch(() => null);
        if (data?.ok) {
          setTeamRows(data.teams);
          setProjectRows(data.projects);
        }
      } catch {
        toast.error('Something went wrong. Try again.');
      } finally {
        setTogglingId(null);
      }
    },
    [eventId, loadData],
  );

  const rows = React.useMemo(() => buildRows(teamRows, projectRows), [teamRows, projectRows]);

  const columns = React.useMemo<ColumnDef<TeamProjectRow>[]>(() => {
    const backHref = `/dashboard/admin/events/${segment}/teams`;
    const teamColumns: ColumnDef<TeamProjectRow>[] = [
      {
        id: 'team',
        header: 'Team',
        accessorFn: (row) => row.members.map((m) => m.name).join(', '),
        cell: ({ row }) => {
          const { team, members } = row.original;
          return (
            <div className='whitespace-normal'>
              <p className='text-sm'>
                {members.length > 0
                  ? members.map((member, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && ', '}
                        {member.checkedIn === false ? (
                          <span className={NOT_CHECKED_IN_CLASS} title='Not checked in'>
                            {member.name}
                          </span>
                        ) : (
                          member.name
                        )}
                      </React.Fragment>
                    ))
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
        cell: ({ getValue }) => <Badge variant='outline'>{getValue<number>()}</Badge>,
      },
    ];
    const tableColumn: ColumnDef<TeamProjectRow> = {
      id: 'table',
      header: 'Table',
      accessorFn: (row) => row.project?.tableSlot ?? undefined,
      sortUndefined: 'last',
      cell: ({ row }) => row.original.project?.tableLabel ?? '—',
      meta: { className: 'w-16 tabular-nums' },
    };
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
          // The project page gates on submission:read:all.
          if (!showProjects) {
            return <span className='font-medium'>{project.title}</span>;
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
          row.project ? (row.project.deactivated ? 'Deactivated' : row.project.published ? 'Published' : 'Draft') : '',
        cell: ({ row }) => {
          const { project } = row.original;
          if (!project) return null;
          return project.deactivated ? (
            <Badge variant='destructive'>Deactivated</Badge>
          ) : (
            <SubmissionStatusBadge published={project.published} />
          );
        },
      },
      {
        id: 'updatedAt',
        header: 'Last edited',
        accessorFn: (row) => row.project?.updatedAt?.getTime() ?? 0,
        enableGlobalFilter: false,
        cell: ({ row }) =>
          row.original.project?.updatedAt ? (
            <span className='text-muted-foreground'>
              <LocalDateTime value={row.original.project.updatedAt} dateStyle='medium' timeStyle='short' />
            </span>
          ) : null,
      },
    ];
    const actionColumn: ColumnDef<TeamProjectRow> = {
      id: 'actions',
      header: () => <span className='sr-only'>Actions</span>,
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'text-right' },
      cell: ({ row }) => {
        const { team, project } = row.original;
        // Every row gets the same menu; an item with nothing to act on is
        // disabled rather than hidden.
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={`Actions for ${project?.title ?? `team led by ${team?.organizerName ?? 'unknown'}`}`}
                disabled={togglingId !== null}
              >
                {project && togglingId === project.id ? <Spinner /> : <MoreHorizontal className='size-4' />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {showTeams && (
                <DropdownMenuItem
                  disabled={!team}
                  onSelect={() => {
                    if (!team) return;
                    setSelectedTeam(team);
                    setShowDetails(true);
                  }}
                >
                  <Eye className='size-4' />
                  View team
                </DropdownMenuItem>
              )}
              {showJudging && (
                <DropdownMenuItem
                  variant={project?.deactivated ? 'default' : 'destructive'}
                  disabled={!project}
                  onSelect={() => {
                    if (project) handleToggleDeactivated(project);
                  }}
                >
                  {project?.deactivated ? (
                    <>
                      <RotateCcw className='size-4' />
                      Reactivate project
                    </>
                  ) : (
                    <>
                      <Ban className='size-4' />
                      Deactivate project
                    </>
                  )}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    };
    return [
      ...(showJudging ? [tableColumn] : []),
      ...(showProjectColumns ? projectColumns.slice(0, 1) : []),
      ...teamColumns,
      ...(showProjectColumns ? projectColumns.slice(1, 2) : []),
      ...(showProjects ? projectColumns.slice(2) : []),
      ...(showTeams || showJudging ? [actionColumn] : []),
    ];
  }, [segment, showTeams, showProjects, showJudging, showProjectColumns, togglingId, handleToggleDeactivated]);

  if (!showTeams && !showProjectColumns) {
    return (
      <div className='text-muted-foreground py-8 text-center'>Teams and projects are not enabled for this event.</div>
    );
  }

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center'>Loading...</div>;
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

  return (
    <Card className='space-y-4 p-6'>
      <div>
        <h2 className='text-lg font-semibold'>
          {showTeams && showProjectColumns ? 'Teams & projects' : showTeams ? 'Teams' : 'Projects'}
        </h2>
        {showTeams && (
          <p className='text-muted-foreground mt-1 text-sm'>
            {teamRows.length} formed team{teamRows.length !== 1 ? 's' : ''}
            {maxTeamSize != null ? ` · max size ${maxTeamSize}` : ''}
            {' · '}
            <span className={NOT_CHECKED_IN_CLASS}>Underlined</span> members haven&apos;t checked in
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder={showProjectColumns ? 'Search teams and projects...' : 'Search teams...'}
        emptyMessage={showTeams ? 'No formed teams yet.' : 'No team has started a project yet.'}
        initialSorting={showJudging ? [{ id: 'table', desc: false }] : [{ id: 'memberCount', desc: true }]}
      />

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className='max-h-[90vh] max-w-lg overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Team roster</DialogTitle>
            <DialogDescription>Led by {selectedTeam?.organizerName}</DialogDescription>
          </DialogHeader>

          {selectedTeam && (
            <ul className='space-y-2'>
              {selectedTeam.members.map((member) => (
                <li key={member.userId} className='flex items-center justify-between gap-2 rounded-md border p-2'>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>
                      <span
                        className={member.checkedIn ? undefined : NOT_CHECKED_IN_CLASS}
                        title={member.checkedIn ? undefined : 'Not checked in'}
                      >
                        {member.name}
                      </span>
                    </p>
                    <p className='text-muted-foreground truncate text-xs'>{member.email}</p>
                  </div>
                  <div className='flex shrink-0 items-center gap-2'>
                    {member.isOrganizer && <Badge variant='outline'>Organizer</Badge>}
                    {canModerate && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label={`Remove ${member.name}`}
                        disabled={removingUserId === member.userId}
                        onClick={() => handleRemove(selectedTeam.teamId, member.userId)}
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
