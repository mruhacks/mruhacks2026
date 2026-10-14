'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, RotateCcw, Send, Square, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  getCampaignResults,
  getSendSummary,
  retryFailedDeliveries,
  scheduleCampaign,
  sendCampaignNow,
  stopCampaign,
  unscheduleCampaign,
} from '@/app/dashboard/admin/campaigns/send-actions';
import { fromDateTimeLocalValue } from '@/lib/datetime';
import type { CampaignStatus } from '@/lib/campaigns/constants';
import {
  LocalDateTime,
  useZoneAbbreviation,
} from '@/components/local-date-time';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Props = {
  campaignId: string;
  status: CampaignStatus;
  scheduledFor: Date | null;
  /** `campaign:send:all` (plus `campaign:operational:all` for operational). */
  canSend: boolean;
};

/** Send now / Stop controls and, once sending has started, the results. */
export function SendPanel({
  campaignId,
  status,
  scheduledFor,
  canSend,
}: Props) {
  if (status === 'draft') {
    return canSend ? <SendNowCard campaignId={campaignId} /> : null;
  }
  if (status === 'scheduled') {
    return (
      <ScheduledCard
        campaignId={campaignId}
        scheduledFor={scheduledFor}
        canSend={canSend}
      />
    );
  }
  return (
    <ResultsCard campaignId={campaignId} status={status} canSend={canSend} />
  );
}

function SendNowCard({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = React.useState(false);
  const [scheduling, setScheduling] = React.useState(false);
  return (
    <Card>
      <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <CardTitle>Send</CardTitle>
          <CardDescription>
            The audience is worked out the moment it&apos;s sent. Emails go out
            at about 10 a second.
          </CardDescription>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' onClick={() => setScheduling(true)}>
            <CalendarClock /> Schedule
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Send /> Send now
          </Button>
        </div>
      </CardHeader>
      {open && (
        <SendNowDialog campaignId={campaignId} onClose={() => setOpen(false)} />
      )}
      {scheduling && (
        <ScheduleDialog
          campaignId={campaignId}
          onClose={() => setScheduling(false)}
        />
      )}
    </Card>
  );
}

function SendNowDialog({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const summary = useQuery({
    queryKey: ['campaign-send-summary', campaignId],
    queryFn: async () => {
      const result = await getSendSummary(campaignId);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    gcTime: 0,
  });
  const [typed, setTyped] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSending, setIsSending] = React.useState(false);

  const data = summary.data;
  const typedOk =
    !data?.requiresTypedConfirmation ||
    Number(typed.replace(/[,\s]/g, '')) === data.recipients;
  const canConfirm = data && data.problems.length === 0 && typedOk;

  async function confirm() {
    if (!data) return;
    setIsSending(true);
    setError(null);
    const result = await sendCampaignNow(
      campaignId,
      data.requiresTypedConfirmation ? data.recipients : undefined,
    );
    setIsSending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    toast.success('Campaign is sending');
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {data ? (
              <>
                Send to <strong>{data.recipients.toLocaleString()}</strong>{' '}
                {data.recipients === 1 ? 'person' : 'people'} now?
              </>
            ) : (
              'Send now?'
            )}
          </DialogTitle>
          <DialogDescription>
            This can be stopped while it&apos;s sending, but emails already sent
            can&apos;t be taken back.
          </DialogDescription>
        </DialogHeader>

        {summary.isPending ? (
          <Spinner />
        ) : summary.isError ? (
          <FieldError>{summary.error.message}</FieldError>
        ) : data!.problems.length > 0 ? (
          <ul className='text-destructive list-disc space-y-1 pl-5 text-sm'>
            {data!.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : data!.requiresTypedConfirmation ? (
          <Field>
            <FieldLabel htmlFor='send-confirm'>
              Type {data!.recipients.toLocaleString()} to confirm
            </FieldLabel>
            <Input
              id='send-confirm'
              inputMode='numeric'
              autoComplete='off'
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setError(null);
              }}
            />
          </Field>
        ) : null}

        {error && <FieldError>{error}</FieldError>}

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!canConfirm || isSending}>
            {isSending ? 'Sending…' : 'Send now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:00 ${suffix}`;
}

/**
 * Whole hours only: the hourly cron is what sends scheduled campaigns. The
 * date and hour are the viewer's own wall clock, turned into an instant here
 * in the browser (AGENTS.md).
 */
function ScheduleDialog({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const [date, setDate] = React.useState('');
  const [hour, setHour] = React.useState('9');
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const local = date ? `${date}T${hour.padStart(2, '0')}:00` : '';
  const zone = useZoneAbbreviation(local);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const instant = fromDateTimeLocalValue(local);
    if (!instant) {
      setError('Choose a date and hour.');
      return;
    }
    setIsSaving(true);
    setError(null);
    const result = await scheduleCampaign(campaignId, instant.toISOString());
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    toast.success('Campaign scheduled');
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <form onSubmit={save} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>Schedule</DialogTitle>
            <DialogDescription>
              Sends on the hour. The audience is worked out then, and the
              campaign can&apos;t be edited until it&apos;s unscheduled.
            </DialogDescription>
          </DialogHeader>
          <div className='grid grid-cols-2 gap-3'>
            <Field>
              <FieldLabel htmlFor='schedule-date'>Date</FieldLabel>
              <Input
                id='schedule-date'
                type='date'
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setError(null);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='schedule-hour'>Hour ({zone})</FieldLabel>
              <Select
                value={hour}
                onValueChange={(next) => {
                  setHour(next);
                  setError(null);
                }}
              >
                <SelectTrigger id='schedule-hour' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {hourLabel(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              Cancel
            </Button>
            <Button type='submit' disabled={isSaving}>
              {isSaving ? 'Scheduling…' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduledCard({
  campaignId,
  scheduledFor,
  canSend,
}: {
  campaignId: string;
  scheduledFor: Date | null;
  canSend: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Card>
      <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <CardTitle>Scheduled</CardTitle>
          <CardDescription>
            Sends{' '}
            <LocalDateTime
              value={scheduledFor}
              dateStyle='full'
              timeStyle='short'
              timeZoneName='short'
            />
            . Unschedule it to make changes.
          </CardDescription>
        </div>
        {canSend && (
          <Button
            variant='outline'
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await unscheduleCampaign(campaignId);
              setBusy(false);
              // A button-only action: nothing to attach an inline error to.
              if (!result.success) toast.error(result.error);
              else toast.success('Back to draft');
            }}
          >
            <Undo2 /> Unschedule
          </Button>
        )}
      </CardHeader>
    </Card>
  );
}

const DELIVERY_BADGE = {
  queued: 'outline',
  sent: 'success',
  failed: 'destructive',
  skipped: 'secondary',
} as const;

function ResultsCard({
  campaignId,
  status,
  canSend,
}: {
  campaignId: string;
  status: CampaignStatus;
  canSend: boolean;
}) {
  const queryClient = useQueryClient();
  const live = status === 'scheduled' || status === 'sending';
  const results = useQuery({
    queryKey: ['campaign-results', campaignId],
    queryFn: async () => {
      const result = await getCampaignResults(campaignId);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    // Poll while it's going out; stop once it's done.
    refetchInterval: (query) =>
      query.state.data &&
      !['scheduled', 'sending'].includes(query.state.data.status)
        ? false
        : live
          ? 5000
          : false,
  });
  const [busy, setBusy] = React.useState(false);

  // Button-only actions with nothing to attach an inline error to, so
  // failures toast (AGENTS.md).
  async function run(
    action: () => Promise<{ success: boolean; error?: string }>,
    message: string,
  ) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? 'Something went wrong');
      return;
    }
    toast.success(message);
    await queryClient.invalidateQueries({
      queryKey: ['campaign-results', campaignId],
    });
  }

  const data = results.data;
  const currentStatus = data?.status ?? status;
  const counts = data?.counts;

  return (
    <Card>
      <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <CardTitle>Results</CardTitle>
          <CardDescription className='capitalize'>
            {currentStatus === 'cancelled' ? 'Stopped' : currentStatus}
          </CardDescription>
        </div>
        {canSend && (
          <div className='flex flex-wrap gap-2'>
            {(currentStatus === 'scheduled' || currentStatus === 'sending') && (
              <Button
                variant='outline'
                disabled={busy}
                onClick={() =>
                  void run(() => stopCampaign(campaignId), 'Campaign stopped')
                }
              >
                <Square /> Stop
              </Button>
            )}
            {(currentStatus === 'sent' || currentStatus === 'sending') &&
              (counts?.failed ?? 0) > 0 && (
                <Button
                  variant='outline'
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => retryFailedDeliveries(campaignId),
                      'Failed deliveries requeued',
                    )
                  }
                >
                  <RotateCcw /> Retry failed
                </Button>
              )}
          </div>
        )}
      </CardHeader>
      <CardContent className='space-y-4'>
        {results.isPending ? (
          <Spinner />
        ) : results.isError ? (
          <FieldError>{results.error.message}</FieldError>
        ) : (
          <>
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
              {(['queued', 'sent', 'failed', 'skipped'] as const).map((key) => (
                <div key={key} className='rounded-md border p-3'>
                  <p className='text-muted-foreground text-xs capitalize'>
                    {key}
                  </p>
                  <p className='text-2xl font-semibold'>
                    {counts![key].toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            {data!.recipients && data!.recipients.length > 0 && (
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='hidden sm:table-cell'>
                        Note
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.recipients.map((r) => (
                      <TableRow key={r.email}>
                        <TableCell className='max-w-48 truncate'>
                          {r.email}
                          {r.sentAt && (
                            <span className='text-muted-foreground block text-xs'>
                              <LocalDateTime
                                value={r.sentAt}
                                dateStyle='medium'
                                timeStyle='short'
                              />
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={DELIVERY_BADGE[r.status]}
                            className='capitalize'
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-muted-foreground hidden max-w-72 truncate text-xs sm:table-cell'>
                          {r.note}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
