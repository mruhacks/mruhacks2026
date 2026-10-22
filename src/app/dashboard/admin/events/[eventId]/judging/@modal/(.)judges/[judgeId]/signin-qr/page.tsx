import { RouteModal } from '@/components/route-modal';
import { loadSignInQrJudge } from '@/lib/judging/signin-qr-judge';

import { SignInQr } from '../../../../signin-qr';

// Never prefetched: the page is a credential's front door, and the roster
// opens it with `router.push` rather than a <Link> for the same reason. With
// nothing prefetched, opening it waits on the server by design.
export const prefetch = 'force-disabled';
export const instant = false;

/**
 * The roster's "Sign-in QR" item, intercepted from `judges/[judgeId]/signin-qr`
 * and shown over the judging page. Closing it navigates back.
 */
export default async function SignInQrModal({ params }: { params: Promise<{ eventId: string; judgeId: string }> }) {
  const { eventId: segment, judgeId } = await params;
  const judge = await loadSignInQrJudge(segment, judgeId);

  return (
    <RouteModal title={`Sign in ${judge.label}`}>
      <SignInQr judge={judge} heading={<h2 className='text-lg leading-none font-semibold'>Sign in {judge.label}</h2>} />
    </RouteModal>
  );
}
