'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  getApplicationResponses,
  getEventWithQuestions,
} from '@/app/dashboard/admin/events/actions';
import type {
  ApplicationResponseRow,
  EventWithQuestions,
} from '@/app/dashboard/admin/events/actions';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { DataTable } from '@/components/data-table/data-table';
import type {
  ApplicationQuestion,
  ApplicationQuestionOption,
} from '@/types/application';
import { isOtherOption, otherTextKey } from '@/lib/other-option';

type ResponsesPageProps = {
  params: Promise<{ eventId: string }>;
};

function getDisplayValue(
  value: unknown,
  type: ApplicationQuestion['type'],
  options: ApplicationQuestionOption[] = [],
  otherText?: unknown,
) {
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
        const option = options.find((optionItem) => optionItem.value === item);
        return withOtherText(option ? option.label : String(item));
      })
      .join(', ');
  }

  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }

  return String(value);
}

export default function ResponsesPage({ params }: ResponsesPageProps) {
  const [eventId, setEventId] = React.useState<string | null>(null);
  const [responses, setResponses] = React.useState<ApplicationResponseRow[]>(
    [],
  );
  const [eventData, setEventData] = React.useState<EventWithQuestions | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [selectedResponse, setSelectedResponse] =
    React.useState<ApplicationResponseRow | null>(null);
  const [showDetails, setShowDetails] = React.useState(false);

  const columns = React.useMemo<ColumnDef<ApplicationResponseRow>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Applicant',
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.fullName}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
      },
      {
        accessorKey: 'createdAt',
        header: 'Submitted',
        cell: ({ row }) =>
          new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(row.original.createdAt)),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={`View application from ${row.original.fullName}`}
            title='View application'
            onClick={() => {
              setSelectedResponse(row.original);
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
  const responseQuestions = (eventData?.questions ?? []).filter(
    (question) => question.active && question.type !== 'section_divider',
  );

  React.useEffect(() => {
    params.then((p) => setEventId(p.eventId));
  }, [params]);

  React.useEffect(() => {
    if (!eventId) return;

    async function fetchData() {
      const [responsesResult, eventResult] = await Promise.all([
        getApplicationResponses(eventId as string),
        getEventWithQuestions(eventId as string),
      ]);

      if (responsesResult.success && responsesResult.data) {
        setResponses(responsesResult.data);
      } else if (!responsesResult.success) {
        toast.error(responsesResult.error || 'Failed to load responses');
      }

      if (eventResult.success && eventResult.data) {
        setEventData(eventResult.data);
      } else if (!eventResult.success) {
        toast.error(eventResult.error || 'Failed to load event data');
      }

      setLoading(false);
    }

    fetchData();
  }, [eventId]);

  if (loading) {
    return (
      <div className='text-muted-foreground py-8 text-center'>Loading...</div>
    );
  }

  return (
    <div className='space-y-4'>
      <div>
        <h2 className='text-lg font-semibold'>Application Responses</h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {responses.length} application{responses.length !== 1 ? 's' : ''}{' '}
          submitted
        </p>
      </div>

      <DataTable
        columns={columns}
        data={responses}
        searchPlaceholder='Search applicants...'
        emptyMessage='No applications yet.'
        initialSorting={[{ id: 'createdAt', desc: true }]}
      />

      {/* Response Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className='max-h-[90vh] max-w-lg overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
          </DialogHeader>

          {selectedResponse && (
            <div className='space-y-4'>
              <div className='border-b pb-4'>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Email
                </p>
                <p className='mt-1 text-sm'>{selectedResponse.email}</p>
              </div>

              <div className='border-b pb-4'>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Full Name
                </p>
                <p className='mt-1 text-sm'>{selectedResponse.fullName}</p>
              </div>

              <div className='border-b pb-4'>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Submitted
                </p>
                <p className='mt-1 text-sm'>
                  {new Date(selectedResponse.createdAt).toLocaleString()}
                </p>
              </div>

              <div>
                <p className='text-muted-foreground mb-3 text-xs font-semibold uppercase'>
                  Responses
                </p>
                {responseQuestions.length > 0 ? (
                  <div className='space-y-3'>
                    {responseQuestions.map((question) => {
                      const response = selectedResponse.responses[question.id];

                      return (
                        <div key={question.id} className='bg-muted rounded p-3'>
                          <p className='text-sm font-medium'>
                            {question.label}
                          </p>
                          <p className='text-muted-foreground mt-1 text-sm'>
                            {getDisplayValue(
                              response,
                              question.type,
                              question.options,
                              selectedResponse.responses[
                                otherTextKey(question.id)
                              ],
                            )}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className='text-muted-foreground text-sm'>
                    No custom questions were included with this application.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
