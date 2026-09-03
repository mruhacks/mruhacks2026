'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { setMarketingConsent, type ConsentData } from './actions';
import { LocalDateTime } from '@/components/local-date-time';

export function ConsentCard({ initial }: { initial: ConsentData }) {
  const [consent, setConsent] = React.useState(initial);
  const [pending, setPending] = React.useState(false);

  async function handleToggle(next: boolean) {
    setPending(true);
    // Optimistic update.
    setConsent((c) => ({ ...c, marketingEmails: next }));
    const res = await setMarketingConsent(next);
    setPending(false);
    if (!res.success || !res.data) {
      // Revert on failure.
      setConsent(initial);
      if (!res.success) toast.error(res.error);
      return;
    }
    setConsent(res.data);
    toast.success(
      next
        ? 'Subscribed to non-essential email.'
        : 'Unsubscribed from non-essential email.',
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Communication preferences</CardTitle>
        <CardDescription>
          Control the non-essential email you receive. Essential messages about
          your applications, events you&apos;ve registered for, and account
          security are always sent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex items-start justify-between gap-4 rounded-lg border p-4'>
          <div className='space-y-1'>
            <Label htmlFor='marketing-consent' className='text-sm font-medium'>
              Marketing &amp; announcements
            </Label>
            <p className='text-muted-foreground text-sm'>
              Newsletters, sponsor offers, and updates about future MRUHacks
              events.
            </p>
            {consent.marketingEmails && consent.marketingConsentAt && (
              <p className='text-muted-foreground text-xs'>
                Consent recorded{' '}
                <LocalDateTime value={consent.marketingConsentAt} />
              </p>
            )}
          </div>
          <Switch
            id='marketing-consent'
            checked={consent.marketingEmails}
            onCheckedChange={handleToggle}
            disabled={pending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
