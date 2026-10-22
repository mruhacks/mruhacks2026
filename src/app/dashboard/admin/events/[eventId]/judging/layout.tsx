import { Suspense } from 'react';

/**
 * Declares the `@modal` parallel slot alongside the judging pages so
 * `@modal/(.)judges/[judgeId]/signin-qr` can intercept the roster's link to a
 * judge's sign-in QR and show it as a modal, while a direct visit or refresh
 * still gets the full page.
 *
 * Parallel-route layouts are their own instant-navigation segment and don't
 * inherit `instant = false` from `dashboard/layout.tsx`. The pages read the
 * session, so this segment must be allowed to block.
 */
export const instant = false;

export default function JudgingLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>{modal}</Suspense>
    </>
  );
}
