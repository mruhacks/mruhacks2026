import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SPONSOR_CTA } from '@/content';

export function SponsorCTA() {
  return (
    <section className='flex w-full px-6 py-12 sm:px-8 sm:py-16 lg:px-16'>
      <div className='mx-auto flex w-full max-w-2xl flex-col items-center text-center'>
        {/* pre-title */}
        <p className='text-pre-title-purple mb-2 text-sm font-semibold sm:text-base'>
          For Sponsors
        </p>

        {/* main title */}
        <h1 className='mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl'>
          Become a sponsor for MRUHacks 2026
        </h1>

        {/* description text */}
        <p className='text-description mb-6 text-base sm:mb-10 sm:text-lg'>
          {SPONSOR_CTA}
        </p>

        {/* buttons */}
        <div className='flex flex-row flex-wrap justify-start gap-3'>
          {/* sponsor button */}
          <Link href='mailto:sponsors@mruhacks.ca' passHref>
            <Button variant='blue' size='lg'>
              Become a Sponsor
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
