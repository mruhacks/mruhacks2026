'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, RotateCcw, Send, ShieldCheck, Square, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  approveCampaign,
  cancelApprovalRequest,
  getApprovalSummary,
  getCampaignResults,
  getSendSummary,
  requestSchedule,
  requestSendNow,
  retryFailedDeliveries,
  stopCampaign,
  unscheduleCampaign,
} from '../send-actions';
import * as Campaigns from '@/lib/campaigns';
import { LocalDateTime, useDisplayTimeZone } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Who asked for the send and who approved it. Names are null once an account is gone. */
type Approval = {
  /** The subject line, repeated in the approve dialog. */
  subject: string;
  /** The signed-in user asked for it, so they can't be the one to approve it. */
  requestedByViewer: boolean;
  requestedByName: string | null;
  requestedAt: Date | null;
  approvedByName: string | null;
};

type Props = {
  campaignId: string;
  status: Campaigns.Status;
  /** When it sends. While awaiting approval: the hour asked for, or null for "on approval". */
  scheduledFor: Date | null;
  approval: Approval;
  /** `campaign:send:all` (plus `campaign:operational:all` for operational). */
  canSend: boolean;
  /** `campaign:approve:all` (plus `campaign:operational:all` for operational). */
  canApprove: boolean;
  prepareSend: () => Promise<boolean>;
  finishPreparing: () => void;
  preparing: boolean;
  draftSaved: boolean;
};

/**
 * Asking for a send, approving one, Stop and, once sending has started, the
 * results. A send takes two people: one asks, a different one approves.
 */
export function SendPanel({
  campaignId,
  status,
  scheduledFor,
  approval,
  canSend,
  canApprove,
  prepareSend,
  finishPreparing,
  preparing,
  draftSaved,
}: Props) {
  if (status === 'draft') {
    return canSend ? (
      <SendNowCard
        campaignId={campaignId}
        prepareSend={prepareSend}
        finishPreparing={finishPreparing}
        preparing={preparing}
        draftSaved={draftSaved}
      />
    ) : null;
  }
  if (status === 'pending_approval') {
    return (
      <PendingApprovalCard
        campaignId={campaignId}
        scheduledFor={scheduledFor}
        approval={approval}
        canSend={canSend}
        canApprove={canApprove}
      />
    );
  }
  if (status === 'scheduled') {
    return <ScheduledCard campaignId={campaignId} scheduledFor={scheduledFor} approval={approval} canSend={canSend} />;
  }
  return <ResultsCard campaignId={campaignId} status={status} canSend={canSend} />;
}

function SendNowCard({
  campaignId,
  prepareSend,
  finishPreparing,
  preparing,
  draftSaved,
}: Pick<Props, 'campaignId' | 'prepareSend' | 'finishPreparing' | 'preparing' | 'draftSaved'>) {
  const [open, setOpen] = React.useState(false);
  const [scheduling, setScheduling] = React.useState(false);
  return (
    <Card>
      <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='space-y-1.5'>
          <CardTitle>Send</CardTitle>
          <CardDescription>
            Pick when it should go out, then a second person approves it. Nothing is sent until they do.
          </CardDescription>
        </div>
        <div className='flex shrink-0 gap-2'>
          <Button
            variant='outline'
            disabled={preparing}
            onClick={async () => {
              if (await prepareSend()) setScheduling(true);
            }}
          >
            <CalendarClock /> Schedule
          </Button>
          <Button
            disabled={preparing}
            onClick={async () => {
              if (await prepareSend()) setOpen(true);
            }}
          >
            <Send /> Send now
          </Button>
        </div>
      </CardHeader>
      {open && (
        <SendNowDialog
          draftSaved={draftSaved}
          campaignId={campaignId}
          onClose={() => {
            setOpen(false);
            finishPreparing();
          }}
        />
      )}
      {scheduling && (
        <ScheduleDialog
          draftSaved={draftSaved}
          campaignId={campaignId}
          onClose={() => {
            setScheduling(false);
            finishPreparing();
          }}
        />
      )}
    </Card>
  );
}

function SendNowDialog({
  campaignId,
  onClose,
  draftSaved,
}: {
  campaignId: string;
  onClose: () => void;
  draftSaved: boolean;
}) {
  const summary = useQuery({
    queryKey: ['campaign-send-summary', campaignId],
    queryFn: async () => {
      const result = await getSendSummary(campaignId);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    gcTime: 0,
    enabled: draftSaved,
  });
  const [typed, setTyped] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSending, setIsSending] = React.useState(false);

  const data = summary.data;
  const typedOk = !data?.requiresTypedConfirmation || Number(typed.replace(/[,\s]/g, '')) === data.recipients;
  const canConfirm = draftSaved && !summary.isFetching && data && data.problems.length === 0 && typedOk;

  async function confirm() {
    if (!data || !canConfirm || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const result = await requestSendNow(campaignId, data.requiresTypedConfirmation ? data.recipients : undefined);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success('Sent for approval');
      onClose();
    } catch {
      setError('Could not ask for approval. Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !isSending && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {data ? (
              <>
                Ask to send to <strong>{data.recipients.toLocaleString()}</strong>{' '}
                {data.recipients === 1 ? 'person' : 'people'}?
              </>
            ) : (
              'Ask to send?'
            )}
          </DialogTitle>
          <DialogDescription>
            It goes out as soon as someone else approves it. Until then the campaign and its audience rules are locked;
            you can withdraw the request to keep editing.
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
            <FieldLabel htmlFor='send-confirm'>Type {data!.recipients.toLocaleString()} to confirm</FieldLabel>
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

        {!draftSaved && <FieldError>Waiting for edits to save. Fix any save errors before confirming.</FieldError>}
        {error && <FieldError>{error}</FieldError>}

        <DialogFooter>
          <Button variant='outline' disabled={isSending} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!canConfirm || isSending}>
            {isSending ? 'Asking…' : 'Ask for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** UTC-hour slots are shown in the viewer's zone, including fractional offsets. */
function ScheduleDialog({
  campaignId,
  onClose,
  draftSaved,
}: {
  campaignId: string;
  onClose: () => void;
  draftSaved: boolean;
}) {
  const [date, setDate] = React.useState('');
  const [selectedSlot, setSelectedSlot] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const zone = useDisplayTimeZone();
  const slots = React.useMemo(() => Campaigns.scheduleSlots(date, zone), [date, zone]);
  const slot = slots.includes(selectedSlot) ? selectedSlot : '';

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draftSaved || isSaving) return;
    if (!slot) {
      setError('Choose a date and hour.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const result = await requestSchedule(campaignId, slot);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success('Sent for approval');
      onClose();
    } catch {
      setError('Could not schedule the campaign. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !isSaving && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <form onSubmit={save} className='flex flex-col gap-4'>
          <DialogHeader>
            <DialogTitle>Schedule</DialogTitle>
            <DialogDescription>
              Choose an available hourly slot in your time zone. Someone else has to approve it before then. Who matches
              the audience is worked out at that hour, and the campaign can&apos;t be edited unless it goes back to
              draft.
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
                  setSelectedSlot('');
                  setError(null);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='schedule-hour'>Time ({zone})</FieldLabel>
              <Select
                value={slot}
                onValueChange={(next) => {
                  setSelectedSlot(next);
                  setError(null);
                }}
              >
                <SelectTrigger id='schedule-hour' className='w-full'>
                  <SelectValue placeholder='Choose a time' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {slots.map((instant) => (
                      <SelectItem key={instant} value={instant}>
                        <LocalDateTime value={instant} timeOnly timeZoneName='short' />
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {!draftSaved && <FieldError>Waiting for edits to save. Fix any save errors before confirming.</FieldError>}
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <Button type='button' variant='outline' disabled={isSaving} onClick={onClose}>
              Cancel
            </Button>
            <Button type='submit' disabled={isSaving || !slot || !draftSaved}>
              {isSaving ? 'Asking…' : 'Ask for approval'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A row of labelled facts about a send: who asked, when it goes, who approved. */
function Facts({ children }: { children: React.ReactNode }) {
  return <dl className='grid gap-x-8 gap-y-4 text-sm sm:grid-cols-3'>{children}</dl>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className='mt-1 font-medium'>{children}</dd>
    </div>
  );
}

function requesterLabel(approval: Approval): string {
  if (approval.requestedByViewer) return 'You';
  return approval.requestedByName ?? 'A deleted account';
}

function SendTime({ scheduledFor }: { scheduledFor: Date | string | null }) {
  if (!scheduledFor) return <>As soon as it&apos;s approved</>;
  return <LocalDateTime value={scheduledFor} dateStyle='medium' timeStyle='short' timeZoneName='short' />;
}

/**
 * A send someone asked for, waiting on a second person. Whoever asked can
 * withdraw it; anyone else who can approve can approve it or turn it down.
 */
function PendingApprovalCard({
  campaignId,
  scheduledFor,
  approval,
  canSend,
  canApprove,
}: Pick<Props, 'campaignId' | 'scheduledFor' | 'approval' | 'canSend' | 'canApprove'>) {
  const [reviewing, setReviewing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  // Whoever asked is usually the one watching this page when the approval lands.
  const status = useQuery({
    queryKey: ['campaign-results', campaignId],
    queryFn: async () => {
      const result = await getCampaignResults(campaignId);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    refetchInterval: 15_000,
  });
  const currentStatus = status.data?.status;
  React.useEffect(() => {
    if (currentStatus && currentStatus !== 'pending_approval') {
      // The editor's status and approval are Server Component props.
      // eslint-disable-next-line custom/no-router-refresh
      router.refresh();
    }
  }, [currentStatus, router]);

  const mayApprove = canApprove && !approval.requestedByViewer;
  const mayCancel = canSend || canApprove;

  return (
    <Card>
      <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-1.5'>
          <CardTitle>{mayApprove ? 'Needs your approval' : 'Waiting for approval'}</CardTitle>
          <CardDescription>
            {approval.requestedByViewer
              ? 'You asked for this send, so someone else has to approve it. It’s locked until they do.'
              : mayApprove
                ? 'Read the email and its audience below. Nothing goes out until you or another approver says so.'
                : 'It’s locked, and nothing goes out, until someone with approval access approves it.'}
          </CardDescription>
        </div>
        {(mayApprove || mayCancel) && (
          <div className='flex shrink-0 gap-2'>
            {mayCancel && (
              <Button
                variant='outline'
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const result = await cancelApprovalRequest(campaignId);
                  setBusy(false);
                  // A button-only action: nothing to attach an inline error to.
                  if (!result.success) toast.error(result.error);
                  else toast.success('Back to draft');
                }}
              >
                <Undo2 /> {approval.requestedByViewer ? 'Withdraw' : 'Back to draft'}
              </Button>
            )}
            {mayApprove && (
              <Button disabled={busy} onClick={() => setReviewing(true)}>
                <ShieldCheck /> Approve
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Facts>
          <Fact label='Asked by'>{requesterLabel(approval)}</Fact>
          <Fact label='Asked'>
            {approval.requestedAt ? (
              <LocalDateTime value={approval.requestedAt} dateStyle='medium' timeStyle='short' />
            ) : (
              '—'
            )}
          </Fact>
          <Fact label='Sends'>
            <SendTime scheduledFor={scheduledFor} />
          </Fact>
        </Facts>
      </CardContent>
      {reviewing && <ApproveDialog campaignId={campaignId} approval={approval} onClose={() => setReviewing(false)} />}
    </Card>
  );
}

function ApproveDialog({
  campaignId,
  approval,
  onClose,
}: {
  campaignId: string;
  approval: Approval;
  onClose: () => void;
}) {
  const summary = useQuery({
    queryKey: ['campaign-approval-summary', campaignId],
    queryFn: async () => {
      const result = await getApprovalSummary(campaignId);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    gcTime: 0,
  });
  const [typed, setTyped] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isApproving, setIsApproving] = React.useState(false);

  const data = summary.data;
  const typedOk = !data?.requiresTypedConfirmation || Number(typed.replace(/[,\s]/g, '')) === data.recipients;
  const canConfirm = !summary.isFetching && data && data.problems.length === 0 && typedOk;
  const sendsNow = data ? data.scheduledFor === null : false;

  async function confirm() {
    if (!data || !canConfirm || isApproving) return;
    setIsApproving(true);
    setError(null);
    try {
      const result = await approveCampaign(campaignId, data.requiresTypedConfirmation ? data.recipients : undefined);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(sendsNow ? 'Approved: the campaign is sending' : 'Approved and scheduled');
      onClose();
    } catch {
      setError('Could not approve the campaign. Please try again.');
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !isApproving && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Approve this send?</DialogTitle>
          <DialogDescription>
            You&apos;re the second check. Once it starts, emails already sent can&apos;t be taken back.
          </DialogDescription>
        </DialogHeader>

        {summary.isPending ? (
          <Spinner />
        ) : summary.isError ? (
          <FieldError>{summary.error.message}</FieldError>
        ) : (
          <>
            <dl className='bg-muted/50 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border p-3 text-sm'>
              <dt className='text-muted-foreground'>Subject</dt>
              <dd className='min-w-0 font-medium wrap-break-word'>{approval.subject}</dd>
              <dt className='text-muted-foreground'>Asked by</dt>
              <dd className='font-medium'>{requesterLabel(approval)}</dd>
              <dt className='text-muted-foreground'>Sends</dt>
              <dd className='font-medium'>
                {sendsNow ? 'Straight away' : <SendTime scheduledFor={data!.scheduledFor} />}
              </dd>
              <dt className='text-muted-foreground'>Reaches</dt>
              <dd className='font-medium'>
                {data!.recipients.toLocaleString()} {data!.recipients === 1 ? 'person' : 'people'}
              </dd>
            </dl>

            {data!.problems.length > 0 ? (
              <ul className='text-destructive list-disc space-y-1 pl-5 text-sm'>
                {data!.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : data!.requiresTypedConfirmation ? (
              <Field>
                <FieldLabel htmlFor='approve-confirm'>Type {data!.recipients.toLocaleString()} to confirm</FieldLabel>
                <Input
                  id='approve-confirm'
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
          </>
        )}

        {error && <FieldError>{error}</FieldError>}

        <DialogFooter>
          <Button variant='outline' disabled={isApproving} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!canConfirm || isApproving}>
            {isApproving ? 'Approving…' : sendsNow ? 'Approve and send' : 'Approve and schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduledCard({
  campaignId,
  scheduledFor,
  approval,
  canSend,
}: Pick<Props, 'campaignId' | 'scheduledFor' | 'approval' | 'canSend'>) {
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  const status = useQuery({
    queryKey: ['campaign-results', campaignId],
    queryFn: async () => {
      const result = await getCampaignResults(campaignId);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    refetchInterval: 5000,
  });
  const currentStatus = status.data?.status;
  React.useEffect(() => {
    if (currentStatus && currentStatus !== 'scheduled') {
      // The editor's status and audience snapshot are Server Component props.
      // eslint-disable-next-line custom/no-router-refresh
      router.refresh();
    }
  }, [currentStatus, router]);
  if (currentStatus && currentStatus !== 'scheduled' && currentStatus !== 'draft') {
    return <ResultsCard campaignId={campaignId} status={currentStatus as Campaigns.Status} canSend={canSend} />;
  }
  return (
    <Card>
      <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-1.5'>
          <CardTitle>Scheduled</CardTitle>
          <CardDescription>
            Approved and locked until it sends. Unschedule it to make changes; it will need approving again.
          </CardDescription>
        </div>
        {canSend && (
          <Button
            variant='outline'
            className='shrink-0'
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
      <CardContent>
        <Facts>
          <Fact label='Sends'>
            <SendTime scheduledFor={scheduledFor} />
          </Fact>
          <Fact label='Asked by'>{requesterLabel(approval)}</Fact>
          <Fact label='Approved by'>{approval.approvedByName ?? 'A deleted account'}</Fact>
        </Facts>
      </CardContent>
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
  status: Campaigns.Status;
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
      query.state.data && !['scheduled', 'sending'].includes(query.state.data.status) ? false : live ? 5000 : false,
  });
  const [busy, setBusy] = React.useState(false);

  // Button-only actions with nothing to attach an inline error to, so
  // failures toast (AGENTS.md).
  async function run(action: () => Promise<{ success: boolean; error?: string }>, message: string) {
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
          <CardDescription>
            {Campaigns.STATUS_LABELS[currentStatus as Campaigns.Status] ?? currentStatus}
          </CardDescription>
        </div>
        {canSend && (
          <div className='flex flex-wrap gap-2'>
            {(currentStatus === 'scheduled' || currentStatus === 'sending') && (
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => void run(() => stopCampaign(campaignId), 'Campaign stopped')}
              >
                <Square /> Stop
              </Button>
            )}
            {(currentStatus === 'sent' || currentStatus === 'sending') &&
              ((counts?.failed ?? 0) > 0 || (counts?.queued ?? 0) > 0) && (
                <Button
                  variant='outline'
                  disabled={busy}
                  onClick={() => void run(() => retryFailedDeliveries(campaignId), 'Pending deliveries queued')}
                >
                  <RotateCcw /> {(counts?.failed ?? 0) > 0 ? 'Retry failed' : 'Resume queued'}
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
                  <p className='text-muted-foreground text-xs capitalize'>{key}</p>
                  <p className='text-2xl font-semibold'>{counts![key].toLocaleString()}</p>
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
                      <TableHead className='hidden sm:table-cell'>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.recipients.map((r) => (
                      <TableRow key={r.email}>
                        <TableCell className='max-w-48 truncate'>
                          {r.email}
                          {r.sentAt && (
                            <span className='text-muted-foreground block text-xs'>
                              <LocalDateTime value={r.sentAt} dateStyle='medium' timeStyle='short' />
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={DELIVERY_BADGE[r.status]} className='capitalize'>
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
