import { cn } from '@/lib/utils';

/**
 * Apple's official "Add to Apple Wallet" badge (US/UK English), used as-is
 * per Apple's Add to Apple Wallet Guidelines: fixed artwork, no recoloring,
 * no stretching — only size and clear space may change. Loaded via a plain
 * <img> from /public rather than next/image's static-import pipeline, which
 * mishandles this SVG under Turbopack.
 */
export function AddToWalletButton({
  eventId,
  className,
}: {
  eventId: string;
  className?: string;
}) {
  return (
    <a
      href={`/api/wallet/pass/${eventId}`}
      className={cn(
        'inline-flex w-fit items-center justify-center rounded-lg transition-opacity hover:opacity-85',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size official brand asset, not a content image */}
      <img
        src='/wallet/add-to-apple-wallet.svg'
        alt='Add to Apple Wallet'
        className='h-10 w-auto'
      />
    </a>
  );
}
