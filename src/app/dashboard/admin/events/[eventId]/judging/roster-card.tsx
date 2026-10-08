'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  addEventJudge,
  removeEventJudge,
  resendJudgeInvite,
  sendOutstandingJudgeInvites,
  setEventJudgeDisabled,
  type JudgingRosterRow,
} from '@/app/dashboard/admin/events/judging-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function JudgeStatus({ judge }: { judge: JudgingRosterRow }) {
  if (judge.deleted) return <Badge variant='secondary'>Account deleted</Badge>;
  if (judge.disabled) return <Badge variant='destructive'>Disabled</Badge>;
  if (judge.startedJudging) return <Badge variant='success'>Judging</Badge>;
  if (judge.signedIn) return <Badge variant='info'>Signed in</Badge>;
  if (judge.invited) return <Badge variant='warning'>Invited</Badge>;
  return <Badge variant='outline'>Not invited</Badge>;
}

/** Judges "Send outstanding invites" would email. */
function isOutstanding(judge: JudgingRosterRow): boolean {
  return !judge.invited && !judge.disabled && judge.email != null;
}

/**
 * The judge roster. Judges are added by email, with a "You're judging"
 * magic link sent straight away or held back to go out with the rest of
 * the outstanding invites. A judge with votes can be disabled but not
 * removed.
 */
export function RosterCard({
  eventId,
  judges,
}: {
  eventId: string;
  judges: JudgingRosterRow[];
}) {
  const [email, setEmail] = React.useState('');
  const [sendInvite, setSendInvite] = React.useState(true);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();
  const [adding, setAdding] = React.useState(false);
  const [sendingAll, setSendingAll] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const outstanding = judges.filter(isOutstanding).length;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    setAdding(true);
    try {
      const added = email.trim();
      const result = await addEventJudge(eventId, email, { sendInvite });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const invite = result.data?.invite;
      if (invite === 'sent') {
        toast.success(`Invited ${added}`);
      } else if (invite === 'not_sent') {
        toast.success(`Added ${added}`);
      } else {
        setNotice(
          invite === 'cooling_down'
            ? `Added ${added}, but they were sent a sign-in link in the last minute, so no invite went out. Send it again shortly.`
            : `Added ${added}, but the invite email failed to send. Send it again to retry.`,
        );
      }
      setEmail('');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setAdding(false);
    }
  }

  async function sendOutstanding() {
    setSendingAll(true);
    try {
      const result = await sendOutstandingJudgeInvites(eventId);
      // A button-only action: nothing to anchor an inline error to.
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const { sent, failed, skipped } = result.data!;
      const notSent = failed + skipped;
      if (notSent === 0) {
        toast.success(`Sent ${sent} ${sent === 1 ? 'invite' : 'invites'}`);
      } else {
        toast.error(
          `Sent ${sent}; ${notSent} couldn’t be sent right now and are still outstanding.`,
        );
      }
    } catch {
      toast.error('Failed to send invites.');
    } finally {
      setSendingAll(false);
    }
  }

  async function rowAction(
    id: string,
    action: () => Promise<{ success: boolean; error?: string }>,
    success?: string,
  ) {
    setBusyId(id);
    try {
      const result = await action();
      // Button-only actions: nothing to anchor an inline error to.
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (success) toast.success(success);
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Judges</CardTitle>
        <CardDescription>
          Add judges by email. Hold invites back to send them all at once.
        </CardDescription>
        {outstanding > 0 && (
          <CardAction>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={sendingAll}
              onClick={sendOutstanding}
            >
              {sendingAll && <Spinner data-icon='inline-start' />}
              Send outstanding invites ({outstanding})
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <form onSubmit={add}>
          <Field data-invalid={Boolean(error)}>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Input
                type='email'
                placeholder='judge@example.com'
                aria-label='Judge email'
                aria-invalid={Boolean(error)}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(undefined);
                }}
              />
              <Button type='submit' disabled={adding || !email.trim()}>
                {adding && <Spinner data-icon='inline-start' />}
                Add judge
              </Button>
            </div>
            {error && <FieldError>{error}</FieldError>}
            {notice && <FieldDescription>{notice}</FieldDescription>}
          </Field>
          <Field orientation='horizontal' className='mt-3'>
            <Checkbox
              id='judge-send-invite'
              checked={sendInvite}
              onCheckedChange={(value) => setSendInvite(value === true)}
            />
            <FieldLabel htmlFor='judge-send-invite' className='font-normal'>
              Email them an invite now
            </FieldLabel>
          </Field>
        </form>

        {judges.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No judges yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Judge</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='text-right'>Comparisons</TableHead>
                <TableHead className='text-right'>
                  <span className='sr-only'>Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {judges.map((judge) => (
                <TableRow key={judge.id}>
                  <TableCell className='whitespace-normal'>
                    <span className='font-medium'>{judge.label}</span>
                    {judge.email && judge.email !== judge.label && (
                      <span className='text-muted-foreground block text-xs'>
                        {judge.email}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <JudgeStatus judge={judge} />
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {judge.comparisons}
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      {judge.email && !judge.disabled && (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          disabled={busyId !== null}
                          onClick={() =>
                            rowAction(
                              judge.id,
                              () => resendJudgeInvite(eventId, judge.id),
                              'Invite sent',
                            )
                          }
                        >
                          {judge.invited ? 'Resend' : 'Send invite'}
                        </Button>
                      )}
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        disabled={busyId !== null}
                        onClick={() =>
                          rowAction(judge.id, () =>
                            setEventJudgeDisabled(
                              eventId,
                              judge.id,
                              !judge.disabled,
                            ),
                          )
                        }
                      >
                        {judge.disabled ? 'Enable' : 'Disable'}
                      </Button>
                      {judge.comparisons === 0 && (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='hover:text-destructive'
                          disabled={busyId !== null}
                          onClick={() =>
                            rowAction(judge.id, () =>
                              removeEventJudge(eventId, judge.id),
                            )
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </div>
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
