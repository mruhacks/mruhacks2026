'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileDown } from 'lucide-react';

import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table/data-table';
import type { AdminApplicationRow } from '@/lib/admin-event';
import { isOtherOption, otherTextKey } from '@/lib/other-option';
import type {
  ApplicationQuestion,
  ApplicationQuestionOption,
} from '@/types/application';
import {
  applicationStatusDisplayList,
  type ApplicationStatusBadgeVariant,
} from '@/types/lookups';

type Props = {
  eventId: string;
  rows: AdminApplicationRow[];
  questions: ApplicationQuestion[];
};

const STATUS_DISPLAY = new Map<
  string,
  { title: string; variant: ApplicationStatusBadgeVariant }
>(
  applicationStatusDisplayList.map((status) => [
    status.label,
    { title: status.title, variant: status.variant },
  ]),
);

/** Mirrors the renderer in the full responses view. */
function getDisplayValue(
  value: unknown,
  type: ApplicationQuestion['type'],
  options: ApplicationQuestionOption[] = [],
  otherText?: unknown,
): string {
  if (value === null || value === undefined) return '—';

  const withOtherText = (label: string) =>
    isOtherOption(label) && typeof otherText === 'string' && otherText
      ? `${label} (${otherText})`
      : label;

  if (type === 'single_select') {
    const option = options.find((item) => item.value === value);
    return withOtherText(option ? option.label : String(value));
  }

  if (type === 'multi_select' && Array.isArray(value)) {
    return value
      .map((item) => {
        const option = options.find((o) => o.value === item);
        return withOtherText(option ? option.label : String(item));
      })
      .join(', ');
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');
}

export function ApplicationsTable({ eventId, rows, questions }: Props) {
  const answerQuestions = React.useMemo(
    () => questions.filter((q) => q.active && q.type !== 'section_divider'),
    [questions],
  );

  /**
   * Columns are grouped by where the value comes from, so a reviewer can
   * tell at a glance that "School" is the applicant's stored profile rather
   * than something they typed on this form — the two disagree often enough
   * to matter when triaging.
   */
  const columns = React.useMemo<ColumnDef<AdminApplicationRow>[]>(
    () => [
      {
        id: 'profile',
        header: 'Participant profile',
        columns: [
          {
            accessorKey: 'fullName',
            header: 'Applicant',
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
            accessorKey: 'email',
            header: 'Email',
          },
          {
            accessorKey: 'university',
            header: 'School',
            cell: ({ row }) => row.original.university ?? '—',
          },
          {
            accessorKey: 'major',
            header: 'Major',
            cell: ({ row }) => row.original.major ?? '—',
          },
          {
            accessorKey: 'yearOfStudy',
            header: 'Year',
            cell: ({ row }) => row.original.yearOfStudy ?? '—',
          },
          {
            id: 'resume',
            header: 'Resume',
            enableSorting: false,
            cell: ({ row }) =>
              row.original.hasResume ? (
                <Button asChild variant='ghost' size='icon'>
                  {/* A plain link, not a fetch: the route 302s to a short-lived
                      signed URL, so the browser has to follow it itself. */}
                  <a
                    href={`/api/admin/events/${eventId}/applicants/${row.original.userId}/resume`}
                    download
                    aria-label={`Download ${row.original.fullName}'s resume`}
                    title='Download resume'
                  >
                    <FileDown className='size-4' />
                  </a>
                </Button>
              ) : (
                <span className='text-muted-foreground'>—</span>
              ),
          },
        ],
      },
      {
        id: 'application',
        header: 'Application',
        columns: [
          {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
              const display = row.original.status
                ? STATUS_DISPLAY.get(row.original.status)
                : undefined;
              return (
                <Badge variant={display?.variant ?? 'secondary'}>
                  {display?.title ?? 'Submitted'}
                </Badge>
              );
            },
          },
          {
            accessorKey: 'submittedAt',
            header: 'Submitted',
            cell: ({ row }) => (
              <LocalDateTime
                value={row.original.submittedAt}
                dateStyle='medium'
              />
            ),
          },
          {
            accessorKey: 'teamCode',
            header: 'Team',
            cell: ({ row }) =>
              row.original.teamCode ? (
                <span className='font-mono text-xs'>
                  {row.original.teamCode}
                </span>
              ) : (
                <span className='text-muted-foreground'>Unassigned</span>
              ),
          },
        ],
      },
      // Every answer is available too, so the full record is here without
      // opening each application — but they start hidden (see
      // `initialColumnVisibility`), because a form with twenty questions
      // would otherwise push Applicant and Status off-screen.
      ...(answerQuestions.length > 0
        ? [
            {
              id: 'answers',
              header: 'Application form answers',
              columns: answerQuestions.map(
                (question): ColumnDef<AdminApplicationRow> => ({
                  id: question.id,
                  header: question.label,
                  accessorFn: (row) => row.responses[question.id],
                  cell: ({ row }) =>
                    getDisplayValue(
                      row.original.responses[question.id],
                      question.type,
                      question.options,
                      row.original.responses[otherTextKey(question.id)],
                    ),
                }),
              ),
            } satisfies ColumnDef<AdminApplicationRow>,
          ]
        : []),
    ],
    [answerQuestions, eventId],
  );

  /**
   * The readable default: the five columns from the dashboard design, plus
   * Email folded under the applicant's name. Everything else stays one
   * click away in the column-visibility menu rather than being dropped.
   */
  const initialColumnVisibility = React.useMemo(
    () => ({
      email: false,
      major: false,
      yearOfStudy: false,
      ...Object.fromEntries(answerQuestions.map((q) => [q.id, false])),
    }),
    [answerQuestions],
  );

  function exportCsv() {
    const header = [
      'Applicant',
      'Email',
      'School',
      'Major',
      'Year',
      'Status',
      'Submitted',
      'Team',
      'Resume on file',
      ...answerQuestions.map((q) => q.label),
    ];
    const body = rows.map((row) => [
      row.fullName,
      row.email,
      row.university ?? '',
      row.major ?? '',
      row.yearOfStudy ?? '',
      row.status
        ? (STATUS_DISPLAY.get(row.status)?.title ?? row.status)
        : 'Submitted',
      row.submittedAt.toISOString(),
      row.teamCode ?? '',
      row.hasResume ? 'yes' : 'no',
      ...answerQuestions.map((q) =>
        getDisplayValue(
          row.responses[q.id],
          q.type,
          q.options,
          row.responses[otherTextKey(q.id)],
        ),
      ),
    ]);

    const blob = new Blob([toCsv([header, ...body])], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'applications.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder='Search applicants…'
      enableColumnVisibility
      initialColumnVisibility={initialColumnVisibility}
      emptyMessage='No applications yet.'
      compact
      toolbarRight={() => (
        <Button variant='outline' size='sm' onClick={exportCsv}>
          <Download aria-hidden className='size-4' />
          Export CSV
        </Button>
      )}
    />
  );
}
