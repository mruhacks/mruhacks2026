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
    return (
      <ScheduledCard
        campaignId={campaignId}
        scheduledFor={scheduledFor}
        approvedByName={approval.approvedByName}
        canSend={canSend}
      />
    );
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
      <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <CardTitle>Send</CardTitle>
          <CardDescription>
            Someone else has to approve a send before anything goes out. Who matches the audience is worked out the
            moment it&apos;s sent, and emails go out at about 10 a second.
          </CardDescription>
        </div>
        <div className='flex flex-wrap gap-2'>
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
      <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <CardTitle>Waiting for approval</CardTitle>
          <CardDescription>
            {approval.requestedByViewer ? 'You' : (approval.requestedByName ?? 'Someone')} asked
            {approval.requestedAt && (
              <>
                {' '}
                on <LocalDateTime value={approval.requestedAt} dateStyle='medium' timeStyle='short' />
              </>
            )}{' '}
            for this to be sent{' '}
            {scheduledFor ? (
              <LocalDateTime value={scheduledFor} dateStyle='full' timeStyle='short' timeZoneName='short' />
            ) : (
              'as soon as it’s approved'
            )}
            .{' '}
            {approval.requestedByViewer
              ? 'Someone else has to approve it first'
              : 'Anyone else with approval access can approve it'}
            , and it&apos;s locked until then.
          </CardDescription>
        </div>
        {(mayApprove || mayCancel) && (
          <div className='flex flex-wrap gap-2'>
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
                <Undo2 /> {approval.requestedByViewer ? 'Withdraw' : 'Send back to draft'}
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
      {reviewing && <ApproveDialog campaignId={campaignId} onClose={() => setReviewing(false)} />}
    </Card>
  );
}

function ApproveDialog({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
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
      toast.success(data.scheduledFor ? 'Approved and scheduled' : 'Approved: the campaign is sending');
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
          <DialogTitle>
            {data ? (
              <>
                Approve sending to <strong>{data.recipients.toLocaleString()}</strong>{' '}
                {data.recipients === 1 ? 'person' : 'people'}?
              </>
            ) : (
              'Approve this send?'
            )}
          </DialogTitle>
          <DialogDescription>
            {data?.scheduledFor ? (
              <>
                It will send{' '}
                <LocalDateTime value={data.scheduledFor} dateStyle='full' timeStyle='short' timeZoneName='short' />.
              </>
            ) : (
              'It will start sending straight away.'
            )}{' '}
            You&apos;re the second check, so read the email and its audience on this page first. Emails already sent
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

        {error && <FieldError>{error}</FieldError>}

        <DialogFooter>
          <Button variant='outline' disabled={isApproving} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!canConfirm || isApproving}>
            {isApproving ? 'Approving…' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduledCard({
  campaignId,
  scheduledFor,
  approvedByName,
  canSend,
}: {
  campaignId: string;
  scheduledFor: Date | null;
  approvedByName: string | null;
  canSend: boolean;
}) {
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
      <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <CardTitle>Scheduled</CardTitle>
          <CardDescription>
            Sends <LocalDateTime value={scheduledFor} dateStyle='full' timeStyle='short' timeZoneName='short' />
            {approvedByName && <>, approved by {approvedByName}</>}. Unschedule it to make changes; it will need
            approving again.
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
