'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  setSubmissionDeactivated,
  type JudgingProjectRow,
} from '@/app/dashboard/admin/events/judging-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Every submission with its table number. Only published, active projects
 * are judged; deactivating one (team left, disqualified) takes it out of
 * dispatch and results while keeping its votes.
 */
export function JudgingProjectsCard({
  eventId,
  projects,
}: {
  eventId: string;
  projects: JudgingProjectRow[];
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function toggle(project: JudgingProjectRow) {
    setBusyId(project.id);
    const result = await setSubmissionDeactivated(
      eventId,
      project.id,
      !project.deactivated,
    );
    setBusyId(null);
    // A button-only action: nothing to anchor an inline error to.
    if (!result.success) {
      toast.error(result.error);
      return;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>
          Table numbers follow the order teams started their projects, drafts
          included, so the floor may have gaps.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            No team has started a project yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-16'>Table</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='text-right'>
                  <span className='sr-only'>Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className='tabular-nums'>
                    {project.tableNumber}
                  </TableCell>
                  <TableCell className='font-medium whitespace-normal'>
                    {project.title}
                  </TableCell>
                  <TableCell>
                    {project.deactivated ? (
                      <Badge variant='destructive'>Deactivated</Badge>
                    ) : project.published ? (
                      <Badge variant='success'>In judging</Badge>
                    ) : (
                      <Badge variant='secondary'>Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      disabled={busyId !== null}
                      onClick={() => toggle(project)}
                    >
                      {project.deactivated ? 'Reactivate' : 'Deactivate'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
