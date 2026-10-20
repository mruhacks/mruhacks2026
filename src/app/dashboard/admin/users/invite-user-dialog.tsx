'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/ui/field';
import { UserPlus } from 'lucide-react';
import { inviteUser } from '@/app/actions/users';

interface InviteUserDialogProps {
  roles: { id: number; slug: string | null }[];
  onInvited?: () => void;
}

export function InviteUserDialog({ roles, onInvited }: InviteUserDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [selectedRoleIds, setSelectedRoleIds] = React.useState<Set<number>>(
    new Set(),
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setSelectedRoleIds(new Set());
    setError(null);
  };

  const toggle = (id: number, checked: boolean) => {
    setError(null);
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await inviteUser(email, Array.from(selectedRoleIds));
    setSubmitting(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    toast.success(`Invite sent to ${email}`);
    reset();
    setOpen(false);
    // The new invite shows up as a row in the users table.
    queryClient.invalidateQueries({ queryKey: ['users'] });
    onInvited?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size='sm' className='h-9'>
          <UserPlus className='size-4' />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>
            For someone without an account yet. They’ll get a magic link to sign
            in, and their chosen roles are applied when they do.
          </DialogDescription>
        </DialogHeader>

        <form
          id='form-invite-user'
          onSubmit={handleSubmit}
          className='space-y-4'
        >
          <div className='space-y-2'>
            <Label htmlFor='invite-email'>Email</Label>
            <Input
              id='invite-email'
              type='email'
              autoComplete='email'
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder='name@example.com'
              required
              disabled={submitting}
            />
          </div>

          {/* Empty when the viewer can't read roles: invite without any. */}
          {roles.length > 0 && (
            <div className='space-y-2'>
              <Label>Roles</Label>
              <div className='max-h-56 space-y-2 overflow-y-auto rounded-md border p-3'>
                {roles.map((r) => (
                  <label
                    key={r.id}
                    className='hover:bg-muted/50 flex items-center gap-2 rounded-md p-1 text-sm'
                  >
                    <Checkbox
                      checked={selectedRoleIds.has(r.id)}
                      onCheckedChange={(v) => toggle(r.id, Boolean(v))}
                      disabled={submitting}
                    />
                    <span className='font-medium'>{r.slug ?? 'unnamed'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

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
            form='form-invite-user'
            disabled={submitting || !email}
          >
            {submitting ? 'Sending…' : 'Send invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
