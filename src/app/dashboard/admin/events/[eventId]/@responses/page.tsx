'use client';

import * as React from 'react';
import { getApplicationResponses, getEventWithQuestions } from '@/app/dashboard/admin/events/actions';
import type { ApplicationResponseRow, EventWithQuestions } from '@/app/dashboard/admin/events/actions';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import type {
  ApplicationQuestion,
  ApplicationQuestionOption,
} from '@/types/application';

type ResponsesPageProps = {
  params: Promise<{ eventId: string }>;
};

function getDisplayValue(
  value: unknown,
  type: ApplicationQuestion['type'],
  options: ApplicationQuestionOption[] = [],
) {
  if (value === null || value === undefined) return '—';

  if (type === 'single_select') {
    const option = options.find((item) => item.value === value);
    return option ? option.label : String(value);
  }

  if (type === 'multi_select' && Array.isArray(value)) {
    return value
      .map((item) => {
        const option = options.find((optionItem) => optionItem.value === item);
        return option ? option.label : String(item);
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
  const [responses, setResponses] = React.useState<ApplicationResponseRow[]>([]);
  const [eventData, setEventData] = React.useState<EventWithQuestions | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedResponse, setSelectedResponse] = React.useState<ApplicationResponseRow | null>(null);
  const [showDetails, setShowDetails] = React.useState(false);

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
    return <div className='text-center text-muted-foreground py-8'>Loading...</div>;
  }

  return (
    <div className='space-y-4'>
      <div>
        <h2 className='text-lg font-semibold'>Application Responses</h2>
        <p className='text-muted-foreground text-sm mt-1'>
          {responses.length} application{responses.length !== 1 ? 's' : ''} submitted
        </p>
      </div>

      {responses.length === 0 ? (
        <div className='rounded-lg border border-dashed p-8 text-center'>
          <p className='text-muted-foreground text-sm'>No applications yet</p>
        </div>
      ) : (
        <div className='space-y-2'>
          {responses.map((response, idx) => (
            <div
              key={idx}
              className='border rounded-lg p-4 flex items-center justify-between hover:bg-muted/50 transition-colors'
            >
              <div className='flex-1 min-w-0'>
                <p className='font-medium text-sm'>{response.email}</p>
                <p className='text-sm text-muted-foreground'>{response.fullName}</p>
                <p className='text-xs text-muted-foreground mt-1'>
                  {new Date(response.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  setSelectedResponse(response);
                  setShowDetails(true);
                }}
              >
                <Eye className='size-4 mr-1' />
                View
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Response Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
          </DialogHeader>

          {selectedResponse && (
            <div className='space-y-4'>
              <div className='border-b pb-4'>
                <p className='text-xs font-semibold text-muted-foreground uppercase'>Email</p>
                <p className='text-sm mt-1'>{selectedResponse.email}</p>
              </div>

              <div className='border-b pb-4'>
                <p className='text-xs font-semibold text-muted-foreground uppercase'>Full Name</p>
                <p className='text-sm mt-1'>{selectedResponse.fullName}</p>
              </div>

              <div className='border-b pb-4'>
                <p className='text-xs font-semibold text-muted-foreground uppercase'>Submitted</p>
                <p className='text-sm mt-1'>
                  {new Date(selectedResponse.createdAt).toLocaleString()}
                </p>
              </div>

              <div>
                <p className='text-xs font-semibold text-muted-foreground uppercase mb-3'>
                  Responses
                </p>
                {eventData?.questions && eventData.questions.length > 0 ? (
                  <div className='space-y-3'>
                    {eventData.questions
                      .filter(
                        (question) =>
                          question.active &&
                          question.type !== 'section_divider',
                      )
                      .map((question) => {
                        const response = selectedResponse.responses[question.id];

                        return (
                          <div key={question.id} className='rounded bg-muted p-3'>
                            <p className='text-sm font-medium'>{question.label}</p>
                            <p className='text-sm text-muted-foreground mt-1'>
                              {getDisplayValue(response, question.type, question.options)}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className='text-sm text-muted-foreground'>No questions found</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
