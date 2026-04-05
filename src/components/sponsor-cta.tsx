import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SPONSOR_CTA } from '@/content';
import Image from 'next/image';

/**
 * SponsorCTA Component
 *
 * Renders the sponsor call-to-action section for the main page.
 * This section encourages potential sponsors to support MRUHacks and provides a direct
 * email link for sponsorship inquiries.
 *
 * @returns A responsive sponsor call-to-action section
 */
export function SponsorCTA() {
  return (
    <div className='mx-auto flex w-full max-w-2xl flex-col items-center text-center'>
      {/* pre-title */}
      <p className='text-pre-title-purple mb-2 text-sm font-semibold sm:text-base'>
        For Sponsors
      </p>

      {/* main title */}
      <h2 className='mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl'>
        Become a sponsor for MRUHacks 2026
      </h2>

      {/* description text */}
      <p className='text-description mb-6 text-base sm:mb-10 sm:text-lg'>
        {SPONSOR_CTA}
      </p>

      {/* sponsor logos */}
      <div className='mb-6 flex flex-col items-center gap-4 sm:mb-10'>
        <Image
          src='/arcurve-logo-sponsor.jpg'
          alt='Arcurve logo'
          width={286}
          height={29}
          sizes='(min-width: 1024px) 300px, (min-width: 640px) 220px, 160px'
          className='h-auto w-40 sm:w-56 lg:w-72'
        />

        <div className='flex items-center justify-center gap-6'>
          <Image
            src='/mru-IIE-logo-sponsor.png'
            alt='MRU Institute for Innovation and Entrepreneurship logo'
            width={165}
            height={48}
            sizes='(min-width: 1024px) 180px, (min-width: 640px) 150px, 120px'
            className='h-auto w-28 sm:w-36 lg:w-44'
          />

          <Image
            src='/mru-library-logo-sponsor.png'
            alt='MRU library logo'
            width={117}
            height={21}
            sizes='(min-width: 1024px) 150px, (min-width: 640px) 120px, 90px'
            className='h-auto w-24 sm:w-32 lg:w-36'
          />
        </div>
      </div>

      {/* sponsor button */}
      <div className='flex flex-row flex-wrap justify-start gap-3'>
        <Button asChild variant='blue' size='lg'>
          <Link href='mailto:sponsors@mruhacks.ca'>Become a Sponsor</Link>
        </Button>
      </div>
    </div>
  );
}
