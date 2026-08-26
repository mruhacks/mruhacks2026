'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
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
import { authClient } from '@/utils/auth-client';

const CONFIRM_PHRASE = 'DELETE';

export function DeleteAccountCard() {
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_PHRASE;

  async function handleDelete() {
    if (!canDelete) return;
    setSubmitting(true);
    const res = await authClient.deleteUser({ callbackURL: '/?deleted=1' });
    setSubmitting(false);

    if (res.error) {
      toast.error(res.error.message ?? 'Failed to start account deletion.');
      return;
    }
    // Verification email sent — deletion completes only after the user clicks
    // the emailed link.
    setSent(true);
  }

  function reset() {
    setConfirmText('');
    setSent(false);
  }

  return (
    <Card className='border-destructive/40'>
      <CardHeader>
        <CardTitle className='text-destructive'>Delete your account</CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data — your
          profile, applications, event history, and preferences. This cannot be
          undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button variant='destructive'>Delete account</Button>
          </DialogTrigger>
          <DialogContent className='sm:max-w-md'>
            {sent ? (
              <>
                <DialogHeader>
                  <DialogTitle>Check your email</DialogTitle>
                  <DialogDescription>
                    We&apos;ve sent a confirmation link to your email address.
                    Your account and all its data will be permanently deleted
                    only after you open that link. The link expires in 24 hours.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant='outline'>Close</Button>
                  </DialogClose>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className='flex items-center gap-2'>
                    <AlertTriangle className='text-destructive size-5' />
                    Delete account
                  </DialogTitle>
                  <DialogDescription>
                    This permanently erases your account and every piece of data
                    tied to it. For your security, we&apos;ll email you a link
                    to confirm before anything is deleted.
                  </DialogDescription>
                </DialogHeader>

                <div className='space-y-2'>
                  <Label htmlFor='delete-confirm'>
                    Type <span className='font-semibold'>{CONFIRM_PHRASE}</span>{' '}
                    to continue
                  </Label>
                  <Input
                    id='delete-confirm'
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete='off'
                    placeholder={CONFIRM_PHRASE}
                  />
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant='outline'>Cancel</Button>
                  </DialogClose>
                  <Button
                    variant='destructive'
                    onClick={handleDelete}
                    disabled={!canDelete || submitting}
                  >
                    {submitting ? 'Sending…' : 'Send confirmation email'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
