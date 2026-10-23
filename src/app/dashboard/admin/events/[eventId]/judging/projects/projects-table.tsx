'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

import { setSubmissionDeactivated, type JudgingProjectRow } from '@/app/dashboard/admin/events/judging-actions';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const statusLabel = (project: JudgingProjectRow) =>
  project.deactivated ? 'Deactivated' : project.published ? 'In judging' : 'Draft';

/**
 * Every submission with its table. Only published, active projects
 * are judged; deactivating one (team left, disqualified) takes it out of
 * dispatch and results while keeping its votes.
 */
export function JudgingProjectsTable({
  eventId,
  segment,
  projects,
  canViewProjects,
}: {
  eventId: string;
  /** The event's URL segment (slug or uuid), kept in links built here. */
  segment: string;
  projects: JudgingProjectRow[];
  /** `submission:read:all`, which the project page gates on. */
  canViewProjects: boolean;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const toggle = React.useCallback(
    async (project: JudgingProjectRow) => {
      setBusyId(project.id);
      try {
        const result = await setSubmissionDeactivated(eventId, project.id, !project.deactivated);
        // A button-only action: nothing to anchor an inline error to.
        if (!result.success) toast.error(result.error);
      } catch {
        toast.error('Something went wrong. Try again.');
      } finally {
        setBusyId(null);
      }
    },
    [eventId],
  );

  const columns = React.useMemo<ColumnDef<JudgingProjectRow>[]>(() => {
    const backHref = `/dashboard/admin/events/${segment}/judging/projects`;
    return [
      {
        id: 'table',
        accessorFn: (row) => row.tableSlot ?? undefined,
        sortUndefined: 'last',
        header: 'Table',
        cell: ({ row }) => row.original.tableLabel ?? '—',
        meta: { className: 'w-16 tabular-nums' },
      },
      {
        accessorKey: 'title',
        header: 'Project',
        enableHiding: false,
        meta: { className: 'whitespace-normal' },
        cell: ({ row }) =>
          canViewProjects ? (
            <Link
              href={{
                pathname: `/dashboard/events/${segment}/projects/${row.original.id}`,
                query: { back: backHref },
              }}
              className='font-medium hover:underline'
            >
              {row.original.title}
            </Link>
          ) : (
            <span className='font-medium'>{row.original.title}</span>
          ),
      },
      {
        id: 'status',
        accessorFn: statusLabel,
        header: 'Status',
        cell: ({ row }) =>
          row.original.deactivated ? (
            <Badge variant='destructive'>Deactivated</Badge>
          ) : row.original.published ? (
            <Badge variant='success'>In judging</Badge>
          ) : (
            <Badge variant='secondary'>Draft</Badge>
          ),
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            disabled={busyId !== null}
            onClick={() => toggle(row.original)}
          >
            {row.original.deactivated ? 'Reactivate' : 'Deactivate'}
          </Button>
        ),
      },
    ];
  }, [segment, canViewProjects, busyId, toggle]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>
          A project takes the next table the first time it&apos;s published and keeps it, so tables never move once
          handed out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={projects}
          getRowId={(row) => row.id}
          searchPlaceholder='Search projects…'
          emptyMessage='No team has started a project yet.'
          pageSize={50}
          compact
        />
      </CardContent>
    </Card>
  );
}
