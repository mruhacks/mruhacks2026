import Image from 'next/image';

import chevronLogo from '@/assets/color_chevron.png';

/**
 * The visual ticket: logo, event name, dates/venue, check-in QR code, and
 * participant name — the same information the Apple and Google Wallet
 * passes carry, for participants viewing it in-app instead.
 */
export function EventTicketCard({
  eventId,
  eventName,
  dateRangeLabel,
  location,
  participantName,
  cacheBust,
}: {
  eventId: string;
  eventName: string;
  dateRangeLabel: string | null;
  location: string | null;
  participantName: string;
  /** A per-view unique value (e.g. Date.now() from the caller) to bust any client-side caching of the QR image. */
  cacheBust: number;
}) {
  const subtitle = [dateRangeLabel, location].filter(Boolean).join(' · ');

  return (
    <div className='flex flex-col items-center gap-4 text-center'>
      <div className='flex items-center gap-3 text-left'>
        <Image src={chevronLogo} alt='' className='size-10 shrink-0' />
        <div className='flex flex-col gap-1'>
          <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            Event Ticket
          </p>
          <h2 className='text-xl font-semibold'>{eventName}</h2>
          {subtitle && (
            <p className='text-muted-foreground text-sm'>{subtitle}</p>
          )}
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated, uncacheable SVG; not eligible for next/image optimization */}
      <img
        src={`/api/wallet/qr/${eventId}?t=${cacheBust}`}
        alt='Check-in QR code'
        className='size-64'
      />

      <p className='text-sm font-medium'>{participantName}</p>
    </div>
  );
}
