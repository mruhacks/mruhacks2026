'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminBanUser, type AdminUserRow } from '@/app/actions/users';

const DURATION_PRESETS: { label: string; seconds: number | null }[] = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '24 hours', seconds: 60 * 60 * 24 },
  { label: '7 days', seconds: 60 * 60 * 24 * 7 },
  { label: '30 days', seconds: 60 * 60 * 24 * 30 },
  { label: 'Permanent', seconds: null },
];

interface BanUserDialogProps {
  user: AdminUserRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBanned: () => void;
}

export function BanUserDialog({
  user,
  open,
  onOpenChange,
  onBanned,
}: BanUserDialogProps) {
  const [reason, setReason] = React.useState('');
  const [durationKey, setDurationKey] = React.useState('permanent');
  const [submitting, setSubmitting] = React.useState(false);

  const handleBan = async () => {
    const preset =
      durationKey === 'permanent'
        ? null
        : (DURATION_PRESETS.find((p) => p.label === durationKey)?.seconds ??
          null);
    setSubmitting(true);
    const res = await adminBanUser(user.id, reason, preset ?? undefined);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Banned ${user.email}`);
    onBanned();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Ban user</DialogTitle>
          <DialogDescription>
            Prevent <span className='font-medium'>{user.email}</span> from
            signing in. Existing sessions are revoked immediately.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='ban-reason'>Reason (optional)</Label>
            <Input
              id='ban-reason'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='Spam, abuse, policy violation…'
            />
          </div>
          <div className='space-y-2'>
            <Label>Duration</Label>
            <Select value={durationKey} onValueChange={setDurationKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_PRESETS.map((p) => (
                  <SelectItem
                    key={p.label}
                    value={p.seconds === null ? 'permanent' : p.label}
                  >
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            onClick={handleBan}
            disabled={submitting}
          >
            {submitting ? 'Banning…' : 'Ban user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
