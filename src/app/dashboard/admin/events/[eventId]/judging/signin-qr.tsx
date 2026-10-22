'use client';

import * as React from 'react';

import { LocalDateTime } from '@/components/local-date-time';
import { Spinner } from '@/components/ui/spinner';
import { JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS, judgeSignInQrPath } from '@/lib/judging/signin-qr';
import type { SignInQrJudge } from '@/lib/judging/signin-qr-judge';
import { useIsHydrated } from '@/lib/use-is-hydrated';

/**
 * A judge's sign-in QR code, loaded straight from the route that mints it.
 * The `<img>` only renders in the browser after mount, so neither SSR nor a
 * prefetch of the page around it mints a link; each mount mints a new one.
 */
export function SignInQr({
  judge,
  heading,
}: {
  judge: SignInQrJudge;
  /** The title, styled by the modal or the full page around it. */
  heading: React.ReactNode;
}) {
  const hydrated = useIsHydrated();
  // Taken on the client, before the request, so the expiry shown is never
  // later than the link's real one. Only read once hydrated.
  const [requestedAt] = React.useState(() => Date.now());
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>('loading');
  const expiresAt = new Date(requestedAt + JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS * 1000).toISOString();

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-2'>
        {heading}
        <p className='text-muted-foreground text-sm'>
          Have the judge scan this with their phone&apos;s camera. It signs whoever scans it in as {judge.email} and
          works once
          {hydrated && (
            <>
              , until <LocalDateTime value={expiresAt} timeOnly />
            </>
          )}
          .
        </p>
      </div>
      {status === 'error' ? (
        <p className='text-destructive py-8 text-center text-sm'>
          Couldn&apos;t create the sign-in QR code. Try again in a minute.
        </p>
      ) : (
        <div className='relative mx-auto size-64'>
          {status === 'loading' && (
            <div className='absolute inset-0 flex items-center justify-center'>
              <Spinner />
            </div>
          )}
          {hydrated && (
            // eslint-disable-next-line @next/next/no-img-element -- minted per request, a live credential; never cached or optimized
            <img
              src={judgeSignInQrPath(judge.eventId, judge.judgeId, requestedAt)}
              alt={`Sign-in QR code for ${judge.label}`}
              onLoad={() => setStatus('loaded')}
              onError={() => setStatus('error')}
              className={status === 'loaded' ? 'size-64 rounded-md bg-white p-2' : 'invisible size-64'}
            />
          )}
        </div>
      )}
    </div>
  );
}
