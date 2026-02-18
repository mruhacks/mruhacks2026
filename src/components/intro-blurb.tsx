import Link from 'next/link';
import { Button } from '@/components/ui/button'; // adjust path if needed

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
    <section className='flex w-full justify-start px-4 py-12 sm:px-6 sm:py-16 lg:px-16'>
      <div className='max-w-2xl'>
        {/* pre-title */}
        <p className='mb-2 text-[14px] font-semibold text-[#25B0FB] sm:text-[16px]'>
          About MRUHacks
        </p>

        {/* main title */}
        <h1 className='mb-4 text-left text-[24px] font-semibold tracking-tight sm:mb-6 sm:text-[30px]'>
          Build, learn, and innovate at MRUHacks.
        </h1>

        {/* description text */}
        <p className='mb-6 text-left text-[14px] text-[#777777] sm:mb-10 sm:text-[16px]'>
          MRUHacks is Mount Royal University’s largest hackathon, bringing
          students together for an immersive three-day experience focused on
          hands-on building, collaboration, and innovation. Hosted at the
          Riddell Library and Learning Centre, the event welcomes designers,
          developers, and tech enthusiasts of all skill levels.
        </p>

        {/* buttons */}
        <div className='flex flex-row flex-wrap justify-start gap-3'>
          {/* register button */}
          <Link href='/login' passHref>
            <Button
              variant='default'
              size='lg'
              className='rounded-[28px] border border-black/30 text-white shadow-md hover:opacity-90'
              style={{
                backgroundImage:
                  'linear-gradient(110deg, #88EFFF 0%, #7C96FF 15%, #E978FF 55%, #FF9182 80%, #FFD16E 100%)',
              }}
            >
              Register Now
            </Button>
          </Link>

          {/* sponsor button */}
          <Link href='mailto:mruhacks@gmail.com' passHref>
            <Button
              variant='default'
              size='lg'
              className='rounded-[28px] border border-black/30 bg-white text-black shadow-md hover:bg-gray-100'
            >
              Become a Sponsor
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
