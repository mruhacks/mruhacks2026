'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileDown } from 'lucide-react';
import { toast } from 'sonner';

import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table/data-table';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import {
  updateApplicationStatus,
  updateRsvpStatus,
} from '@/app/dashboard/admin/events/actions';
import {
  RSVP_DASHBOARD_LABELS,
  getApplicationDisplayStatus,
} from '@/app/dashboard/events/event-display-status';
import type { AdminApplicationRow } from '@/lib/admin-event';
import { EMPTY_FILTER_VALUE } from '@/components/data-table/data-table-column-filter';
import { isOtherOption, otherTextKey } from '@/lib/other-option';
import type {
  ApplicationQuestion,
  ApplicationQuestionOption,
} from '@/types/application';
import {
  applicationStatusDisplayList,
  rsvpStatusDisplayList,
  type ApplicationStatus,
  type ApplicationStatusBadgeVariant,
  type RsvpStatus,
} from '@/types/lookups';

export type ApplicationsTableRow = AdminApplicationRow & {
  /** Effective status of the applicant's latest-wave RSVP, if invited. */
  rsvpStatus: RsvpStatus | null;
};

type Props = {
  eventId: string;
  rows: ApplicationsTableRow[];
  questions: ApplicationQuestion[];
  /** Whether the viewer holds `application:review:all`. */
  canReview: boolean;
  /** Whether the viewer holds `rsvp:write:all`. */
  canManageRsvp: boolean;
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

const RSVP_STATUS_DISPLAY = new Map<
  string,
  { title: string; variant: ApplicationStatusBadgeVariant }
>(
  rsvpStatusDisplayList.map((status) => [
    status.label,
    { title: status.title, variant: status.variant },
  ]),
);

/**
 * The same badge the applicant sees on their dashboard: RSVP status wins
 * once they've been invited, otherwise the application's review status.
 * A row with neither is an untriaged submission.
 */
function getStatusDisplay(row: ApplicationsTableRow): {
  label: string;
  variant: ApplicationStatusBadgeVariant;
} {
  const statusDisplay = row.status ? STATUS_DISPLAY.get(row.status) : undefined;
  if (!row.rsvpStatus && !statusDisplay) {
    return { label: row.status ?? 'Submitted', variant: 'secondary' };
  }
  const display = getApplicationDisplayStatus({
    hasApplication: true,
    userStatus: 'applied',
    statusKey: statusDisplay ? (row.status as ApplicationStatus) : null,
    statusDisplay: statusDisplay ?? null,
    rsvpStatusLabel: row.rsvpStatus,
    rsvpStatusDisplay: row.rsvpStatus
      ? (RSVP_STATUS_DISPLAY.get(row.rsvpStatus) ?? null)
      : null,
  });
  return { label: display.label, variant: display.badgeVariant };
}

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

/** Single-select, multi-select and yes/no answers filter by choice. */
function getAnswerFilterMeta(
  question: ApplicationQuestion,
): ColumnDef<ApplicationsTableRow>['meta'] {
  if (question.type === 'boolean') {
    return {
      filterVariant: 'select',
      filterOptions: [
        { label: 'Yes', value: 'true' },
        { label: 'No', value: 'false' },
        { label: '(Empty)', value: EMPTY_FILTER_VALUE },
      ],
    };
  }
  if (question.type === 'single_select' || question.type === 'multi_select') {
    return {
      filterVariant: 'select',
      filterOptions: [
        ...(question.options ?? []).map((o) => ({
          label: o.label,
          value: o.value,
        })),
        { label: '(Empty)', value: EMPTY_FILTER_VALUE },
      ],
    };
  }
  return { filterVariant: 'text' };
}

const APPLICATION_STATUS_OPTIONS = applicationStatusDisplayList.map(
  (status) => ({
    value: `application:${status.label}`,
    title: status.title,
    variant: status.variant as ApplicationStatusBadgeVariant,
  }),
);

/** Same wording the applicant's dashboard badge uses. */
const RSVP_STATUS_OPTIONS = rsvpStatusDisplayList.map((status) => ({
  value: `rsvp:${status.label}`,
  title: RSVP_DASHBOARD_LABELS[status.label],
  variant: status.variant as ApplicationStatusBadgeVariant,
}));

type StatusChange =
  | { kind: 'application'; status: ApplicationStatus }
  | { kind: 'rsvp'; status: RsvpStatus };

function parseStatusValue(value: string): StatusChange {
  const [kind, status] = value.split(':');
  return kind === 'rsvp'
    ? { kind: 'rsvp', status: status as RsvpStatus }
    : { kind: 'application', status: status as ApplicationStatus };
}

/**
 * The status badge, as a dropdown of both application review statuses and
 * RSVP statuses. Which half is usable follows the badge's own precedence:
 * before an invitation only the review status means anything, and after
 * one the RSVP is the status of record — so the other half is disabled
 * (the server refuses those changes too).
 */
function StatusCell({
  row,
  canReview,
  canManageRsvp,
  onChange,
}: {
  row: ApplicationsTableRow;
  canReview: boolean;
  canManageRsvp: boolean;
  onChange: (change: StatusChange) => void;
}) {
  const display = getStatusDisplay(row);
  const badge = <Badge variant={display.variant}>{display.label}</Badge>;

  if (!canReview && !canManageRsvp) return badge;

  const invited = row.rsvpStatus !== null;
  const value = row.rsvpStatus
    ? `rsvp:${row.rsvpStatus}`
    : row.status
      ? `application:${row.status}`
      : '';

  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(parseStatusValue(next))}
    >
      <SelectTrigger
        size='sm'
        className='h-7 gap-1 border-none px-1 shadow-none'
        aria-label={`Status for ${row.fullName}`}
      >
        {badge}
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>
            Application
            {invited && ' · locked after RSVP invitation'}
          </SelectLabel>
          {APPLICATION_STATUS_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={invited || !canReview}
            >
              <Badge variant={option.variant}>{option.title}</Badge>
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>
            RSVP
            {!invited && ' · send an RSVP invitation first'}
          </SelectLabel>
          {RSVP_STATUS_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={!invited || !canManageRsvp}
            >
              <Badge variant={option.variant}>{option.title}</Badge>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
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

export function ApplicationsTable({
  eventId,
  rows: serverRows,
  questions,
  canReview,
  canManageRsvp,
}: Props) {
  // Optimistic status edits, keyed by application. The server action's
  // cache invalidation refreshes `serverRows` with the same value, so an
  // entry only matters for the moment between the click and that refresh.
  const [statusOverrides, setStatusOverrides] = React.useState<
    ReadonlyMap<string, StatusChange>
  >(new Map());

  const rows = React.useMemo(
    () =>
      statusOverrides.size === 0
        ? serverRows
        : serverRows.map((row) => {
            const change = statusOverrides.get(row.applicationId);
            if (!change) return row;
            return change.kind === 'rsvp'
              ? { ...row, rsvpStatus: change.status }
              : { ...row, status: change.status };
          }),
    [serverRows, statusOverrides],
  );

  const changeStatus = React.useCallback(
    async (row: ApplicationsTableRow, change: StatusChange) => {
      const current = change.kind === 'rsvp' ? row.rsvpStatus : row.status;
      if (current === change.status) return;
      const setOverride = (value: StatusChange | null) =>
        setStatusOverrides((prev) => {
          const next = new Map(prev);
          if (value) next.set(row.applicationId, value);
          else next.delete(row.applicationId);
          return next;
        });

      setOverride(change);
      try {
        const input = {
          eventId,
          applicationId: row.applicationId,
        };
        const result =
          change.kind === 'rsvp'
            ? await updateRsvpStatus({ ...input, status: change.status })
            : await updateApplicationStatus({
                ...input,
                status: change.status,
              });
        if (!result.success) {
          setOverride(null);
          toast.error(result.error);
        }
      } catch {
        setOverride(null);
        toast.error('Failed to update status.');
      }
    },
    [eventId],
  );

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
  const columns = React.useMemo<ColumnDef<ApplicationsTableRow>[]>(
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
            meta: { filterVariant: 'select' },
            cell: ({ row }) => row.original.university ?? '—',
          },
          {
            accessorKey: 'major',
            header: 'Major',
            meta: { filterVariant: 'select' },
            cell: ({ row }) => row.original.major ?? '—',
          },
          {
            accessorKey: 'yearOfStudy',
            header: 'Year',
            meta: { filterVariant: 'select' },
            cell: ({ row }) => row.original.yearOfStudy ?? '—',
          },
          {
            id: 'resume',
            header: 'Resume',
            enableSorting: false,
            accessorFn: (row) => (row.hasResume ? 'Yes' : 'No'),
            meta: { filterVariant: 'select' },
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
            id: 'status',
            header: 'Status',
            accessorFn: (row) => getStatusDisplay(row).label,
            meta: { filterVariant: 'select' },
            cell: ({ row }) => (
              <StatusCell
                row={row.original}
                canReview={canReview}
                canManageRsvp={canManageRsvp}
                onChange={(status) => changeStatus(row.original, status)}
              />
            ),
          },
          {
            accessorKey: 'submittedAt',
            header: 'Submitted',
            meta: { filterVariant: 'date' },
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
                (question): ColumnDef<ApplicationsTableRow> => {
                  const meta = getAnswerFilterMeta(question);
                  return {
                    id: question.id,
                    header: question.label,
                    // Choice questions keep the raw option value(s) so the
                    // filter can match on option ids; free-text answers use
                    // the rendered string, so filtering matches what's shown.
                    accessorFn: (row) =>
                      meta?.filterVariant === 'select'
                        ? row.responses[question.id]
                        : getDisplayValue(
                            row.responses[question.id],
                            question.type,
                            question.options,
                            row.responses[otherTextKey(question.id)],
                          ),
                    meta,
                    cell: ({ row }) =>
                      getDisplayValue(
                        row.original.responses[question.id],
                        question.type,
                        question.options,
                        row.original.responses[otherTextKey(question.id)],
                      ),
                  };
                },
              ),
            } satisfies ColumnDef<ApplicationsTableRow>,
          ]
        : []),
    ],
    [answerQuestions, eventId, canReview, canManageRsvp, changeStatus],
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
      getStatusDisplay(row).label,
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
      enableColumnFilters
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
