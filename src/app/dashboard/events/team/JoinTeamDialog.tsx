'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/ui/field';
import { joinTeamByCode } from '@/app/dashboard/events/team-actions';
import { TEAM_CODE_LENGTH } from '@/lib/team-code-constants';

type Props = { eventId: string; defaultCode?: string };

export function JoinTeamDialog({ eventId, defaultCode }: Props) {
  const [open, setOpen] = React.useState(Boolean(defaultCode));
  const [code, setCode] = React.useState(defaultCode ?? '');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await joinTeamByCode(eventId, code);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    toast.success(
      typeof result.data === 'string' ? result.data : 'Joined team.',
    );
    setOpen(false);
    setCode('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size='sm' variant='outline'>
          <LogIn className='size-4' />
          Join a team
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Join a team</DialogTitle>
          <DialogDescription>
            Enter the {TEAM_CODE_LENGTH}-character code your teammate shared.
          </DialogDescription>
        </DialogHeader>
        <form id='form-join-team' onSubmit={handleSubmit} className='space-y-2'>
          <Label htmlFor='join-code'>Team code</Label>
          <Input
            id='join-code'
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            maxLength={TEAM_CODE_LENGTH}
            className='font-mono uppercase'
            placeholder='ABCD1234'
            autoFocus
            required
            disabled={submitting}
            aria-invalid={error ? true : undefined}
          />
          {error && <FieldError>{error}</FieldError>}
        </form>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type='submit'
            form='form-join-team'
            disabled={submitting || code.length !== TEAM_CODE_LENGTH}
          >
            {submitting ? 'Joining…' : 'Join'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
