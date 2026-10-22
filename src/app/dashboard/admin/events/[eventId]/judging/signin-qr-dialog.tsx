'use client';

import * as React from 'react';

import type { JudgingRosterRow } from '@/app/dashboard/admin/events/judging-actions';
import { LocalDateTime } from '@/components/local-date-time';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS,
  judgeSignInQrPath,
} from '@/lib/judging/signin-qr';

export type SignInQr = {
  judge: JudgingRosterRow;
  /** When the dialog opened; the link is minted moments after. */
  requestedAt: number;
};

/**
 * Shows a judge's sign-in QR code, streamed straight from the route that
 * mints it. The code is a live credential, so it's dropped as soon as the
 * dialog closes, and reopening mints a new one.
 */
export function SignInQrDialog({
  eventId,
  qr,
  onClose,
}: {
  eventId: string;
  qr: SignInQr | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={qr !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {qr && (
          <SignInQrBody
            key={`${qr.judge.id}:${qr.requestedAt}`}
            eventId={eventId}
            qr={qr}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SignInQrBody({ eventId, qr }: { eventId: string; qr: SignInQr }) {
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  // Counted from before the request, so it never shows later than the
  // link's real expiry.
  const expiresAt = new Date(
    qr.requestedAt + JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS * 1000,
  ).toISOString();

  return (
    <>
      <DialogHeader>
        <DialogTitle>Sign in {qr.judge.label}</DialogTitle>
        <DialogDescription>
          Have the judge scan this with their phone&apos;s camera. It signs
          whoever scans it in as {qr.judge.email}, works once, and expires at{' '}
          <LocalDateTime value={expiresAt} timeOnly />.
        </DialogDescription>
      </DialogHeader>
      {status === 'error' ? (
        <p className='text-destructive py-8 text-center text-sm'>
          Couldn&apos;t create the sign-in QR code. Close this and try again in
          a minute.
        </p>
      ) : (
        <div className='relative mx-auto size-64'>
          {status === 'loading' && (
            <div className='absolute inset-0 flex items-center justify-center'>
              <Spinner />
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- minted per request, a live credential; never cached or optimized */}
          <img
            src={judgeSignInQrPath(eventId, qr.judge.id, qr.requestedAt)}
            alt={`Sign-in QR code for ${qr.judge.label}`}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            className={
              status === 'loaded'
                ? 'size-64 rounded-md bg-white p-2'
                : 'invisible size-64'
            }
          />
        </div>
      )}
    </>
  );
}
