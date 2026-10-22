'use client';

import * as React from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { unsubscribe } from './actions';

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = React.useState<
    'idle' | 'working' | 'done' | 'no_account' | 'invalid' | 'error'
  >('idle');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState('working');
    try {
      const outcome = await unsubscribe(token);
      setState(outcome === 'unsubscribed' ? 'done' : outcome);
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div className='space-y-3'>
        <p className='font-medium'>You&apos;re unsubscribed.</p>
        <p className='text-muted-foreground text-sm'>
          You won&apos;t get marketing email from MRUHacks anymore. We&apos;ll
          still send what you need for events you register for. Changed your
          mind? Turn it back on from{' '}
          <Link href='/dashboard/account' className='underline'>
            your account
          </Link>
          .
        </p>
      </div>
    );
  }

  if (state === 'no_account') {
    return (
      <p className='text-muted-foreground text-sm'>
        We couldn&apos;t find an account for this address. It may have been
        deleted, in which case we won&apos;t email it again.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-3'>
      <p className='text-muted-foreground text-sm'>
        Stop all marketing email from MRUHacks to this address? Email about
        events you&apos;ve registered for isn&apos;t affected.
      </p>
      <Button type='submit' disabled={state === 'working'}>
        {state === 'working' ? 'Unsubscribing…' : 'Unsubscribe'}
      </Button>
      {state === 'invalid' && (
        <FieldError>This unsubscribe link isn&apos;t valid.</FieldError>
      )}
      {state === 'error' && (
        <FieldError>Something went wrong. Please try again.</FieldError>
      )}
    </form>
  );
}
