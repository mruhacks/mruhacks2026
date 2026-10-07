'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  addEventJudge,
  removeEventJudge,
  resendJudgeInvite,
  setEventJudgeDisabled,
  type JudgingRosterRow,
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
import { Field, FieldDescription, FieldError } from '@/components/ui/field';
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
  if (judge.linked) return <Badge variant='success'>Signed in</Badge>;
  return <Badge variant='warning'>Invited</Badge>;
}

/**
 * The judge roster. Judges are added by email; everyone gets a "You're
 * judging" magic link. A judge with votes can be disabled but not removed.
 */
export function RosterCard({
  eventId,
  judges,
}: {
  eventId: string;
  judges: JudgingRosterRow[];
}) {
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();
  const [adding, setAdding] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    setAdding(true);
    const result = await addEventJudge(eventId, email);
    setAdding(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    if (result.data?.emailSent === false) {
      setNotice(
        `Added ${email.trim()}, but the invite email failed to send. Use Resend to try again.`,
      );
    } else {
      toast.success(`Invited ${email.trim()}`);
    }
    setEmail('');
  }

  async function rowAction(
    id: string,
    action: () => Promise<{ success: boolean; error?: string }>,
    success?: string,
  ) {
    setBusyId(id);
    const result = await action();
    setBusyId(null);
    // Button-only actions: nothing to anchor an inline error to.
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    if (success) toast.success(success);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Judges</CardTitle>
        <CardDescription>Add judges by email.</CardDescription>
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
                          Resend
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
