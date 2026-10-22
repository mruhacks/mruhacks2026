import * as React from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { loadSignInQrJudge } from '@/lib/judging/signin-qr-judge';

import { SignInQr } from '../../../signin-qr';

// Never prefetched: the page is a credential's front door, and the roster
// opens it with `router.push` rather than a <Link> for the same reason. With
// nothing prefetched, opening it waits on the server by design.
export const prefetch = 'force-disabled';
export const instant = false;

type Props = { params: Promise<{ eventId: string; judgeId: string }> };

/**
 * A judge's sign-in QR code as a page of its own, for a direct visit or a
 * refresh. Opening it from the roster is intercepted by
 * `@modal/(.)judges/[judgeId]/signin-qr` and shown as a modal instead.
 */
export default function SignInQrRoute({ params }: Props) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <SignInQrContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function SignInQrContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment, judgeId } = await paramsPromise;
  const judge = await loadSignInQrJudge(segment, judgeId);

  return (
    <Card className='mx-auto w-full max-w-md'>
      <CardContent>
        <SignInQr
          judge={judge}
          heading={
            <h2 className='text-lg font-semibold'>Sign in {judge.label}</h2>
          }
        />
      </CardContent>
    </Card>
  );
}
