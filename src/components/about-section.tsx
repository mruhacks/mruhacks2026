import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { INTRO_BLURB } from '../content';

/**
 *About
 *
 * An introductory section for MRUHacks 2026 with a pre-title, main title, description,
 * and two action buttons: "Register Now" and "Become a sponsor".
 *
 * This component is intended to be used only once on the homepage.
 *
 * @returns section for intro blurb
 */
export function About() {
  return (
    <div className='max-w-2xl'>
        {/* pre-title */}
        <p className='text-pre-title-blue mb-2 text-sm font-semibold sm:text-base'>
          About MRUHacks
        </p>

        {/* main title */}
        <h1 className='mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl'>
          Build, learn, and innovate at MRUHacks.
        </h1>

        {/* description text */}
        <p className='text-description mb-6 text-base sm:mb-10 sm:text-lg'>
          {INTRO_BLURB}
        </p>

        {/* buttons */}
        <div className='flex flex-row flex-wrap justify-start gap-3'>
          {/* register button */}
          <Link href='/signup' passHref>
            <Button variant='gradient' size='lg'>
              Register Now
            </Button>
          </Link>

          {/* sponsor button */}
          <Link href='mailto:sponsors@mruhacks.ca' passHref>
            <Button variant='whiteDefault' size='lg'>
              Become a Sponsor
            </Button>
          </Link>
        </div>
    </div>
  );
}
