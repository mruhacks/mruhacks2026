import { cn } from '@/lib/utils';

/**
 * Google's official "Add to Google Wallet" badge (US English), used as-is
 * per Google Wallet's brand guidelines: fixed artwork, no recoloring, no
 * stretching — only size and clear space may change. Loaded via a plain
 * <img> from /public, same as the Apple badge, so it isn't run through
 * next/image's static-import pipeline.
 */
export function AddToGoogleWalletButton({
  eventId,
  className,
}: {
  eventId: string;
  className?: string;
}) {
  return (
    <a
      href={`/api/wallet/google/${eventId}`}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        'inline-flex w-fit items-center justify-center rounded-lg transition-opacity hover:opacity-85',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size official brand asset, not a content image */}
      <img
        src='/wallet/add-to-google-wallet.svg'
        alt='Add to Google Wallet'
        className='h-10 w-auto'
      />
    </a>
  );
}
