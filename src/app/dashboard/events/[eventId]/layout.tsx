import { Suspense } from 'react';

/**
 * Declares the `@modal` parallel slot alongside the normal page content so
 * `@modal/(.)ticket` can intercept navigation to `./ticket` and render it as
 * an overlay, while a direct visit/refresh still hits the real full page.
 *
 * Parallel-route layouts are their own instant-navigation segment — they do
 * not inherit `instant = false` from `dashboard/layout.tsx`. The page reads
 * the session and event row, so this segment must be allowed to block.
 */
export const instant = false;

export default function EventEntryLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>{children}</Suspense>
      <Suspense fallback={null}>{modal}</Suspense>
    </>
  );
}
