import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { INTRO_BLURB } from './content';
import { PreTitle, MainTitle, Description } from './ui/typography';

/**
 * IntroBlurb
 *
 * An introductory section for MRUHacks 2026 with a pre-title, main title, description,
 * and two action buttons: "Register Now" and "Become a sponsor".
 *
 * This component is intended to be used only once on the homepage.
 *
 * @returns section for intro blurb
 */
export function IntroBlurb() {
  return (
    <section className='flex w-full justify-start px-6 py-12 sm:px-8 sm:py-16 lg:px-16'>
      <div className='max-w-2xl'>
        {/* pre-title */}
        <PreTitle className='text-pre-title-blue'>About MRUHacks</PreTitle>

        {/* main title */}
        <MainTitle>Build, learn, and innovate at MRUHacks.</MainTitle>

        {/* description text */}
        <Description>{INTRO_BLURB}</Description>

        {/* buttons */}
        <div className='flex flex-row flex-wrap justify-start gap-3'>
          {/* register button */}
          <Link href='/login' passHref>
            <Button variant='gradient' size='lg'>
              Register Now
            </Button>
          </Link>

          {/* sponsor button */}
          <Link href='sponsors@mruhacks.ca' passHref>
            <Button variant='whiteDefault' size='lg'>
              Become a Sponsor
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
