import Image from 'next/image';
import logoImage from '@/assets/logo_color_and_black.png';
import ArcurveLogo from '@/assets/arcurve_logo_2024_color_large.png';
import { Button } from '@/components/ui/button';
import gloveSticker from '@/assets/mruhacks-2026-stickers-glove.png';
import logoSticker from '@/assets/mruhacks-2026-stickers-logo.png';
import { HeroArtwork } from '@/components/hero-artwork';
import {
  EVENT_DATE_DISPLAY,
  EVENT_LOCATION_DISPLAY,
  REGISTRATION_OPEN,
  LOGIN_ENABLED,
} from '@/content';

export function HeroSection() {
  return (
    <section className='relative overflow-hidden'>
      <div className='mx-auto w-full max-w-screen-2xl px-4 pt-5 pb-10 sm:px-6 lg:px-16 lg:pt-7 lg:pb-12'>
        <div className='flex w-full items-center justify-between'>
          <div className='relative h-7 w-28 shrink-0 lg:h-12 lg:w-48'>
            <Image
              src={logoImage}
              alt='MRUHacks Logo'
              fill
              className='object-contain object-left'
              priority
            />
          </div>
          <div className='hidden items-center gap-6 lg:flex'>
            {REGISTRATION_OPEN && (
              <Button
                variant='gradient'
                className='rounded-full border border-[#5e5e5e] py-5 text-xl font-semibold tracking-[-0.02em] text-white hover:opacity-90'
                aria-disabled='true'
              >
                Register Now
              </Button>
            )}
            {LOGIN_ENABLED && (
              <Button
                shadow='md'
                className='rounded-full border border-[#5e5e5e] bg-black py-5 text-xl font-semibold tracking-[-0.02em] text-white hover:bg-neutral-800'
                aria-disabled='true'
              >
                Log In
              </Button>
            )}
          </div>
          {REGISTRATION_OPEN && (
            <Button
              className='h-auto shrink-0 rounded-full bg-black px-4 py-2 text-xs font-semibold tracking-tight text-white hover:bg-neutral-800 lg:hidden'
              aria-disabled='true'
            >
              Register Now
            </Button>
          )}
        </div>

        <div className='mx-auto mt-16 flex w-full max-w-sm flex-col items-center lg:mt-20 lg:max-w-2xl xl:mt-28 xl:max-w-none xl:flex-row xl:items-start xl:justify-center xl:gap-16'>
          <div className='w-full xl:max-w-xl'>
            <div className='relative mb-5 w-full'>
              <h1 className='flex flex-col items-center px-3 text-center text-3xl/tight font-semibold tracking-[-0.03em] sm:px-11 sm:text-4xl lg:text-5xl lg:tracking-[-0.04em] xl:px-0'>
                <span className='inline-flex items-center justify-center whitespace-nowrap'>
                  Mount Royal University&apos;s
                </span>
                <span className='inline-flex items-center justify-center'>
                  Premier Hackathon.
                </span>
                <span className='relative inline-flex items-center justify-center'>
                  Now Three Days!
                  <svg
                    className='absolute -bottom-0.5 left-0 z-0 h-2 w-full lg:-bottom-1 lg:h-2.5'
                    viewBox='0 0 104 9'
                    fill='none'
                    xmlns='http://www.w3.org/2000/svg'
                    preserveAspectRatio='none'
                    aria-hidden
                  >
                    <path
                      d='M2 5.2C17.8 2.7 55.7 0.7 102 4.9'
                      stroke='#0C00FD'
                      strokeWidth='4'
                      strokeLinecap='round'
                    />
                  </svg>
                </span>
              </h1>
              <Image
                src={logoSticker}
                alt=''
                width={80}
                className='pointer-events-none absolute top-10 left-0 w-8 -rotate-10 lg:top-20 lg:-left-2 lg:w-12'
                aria-hidden
              />
              <Image
                src={gloveSticker}
                alt=''
                width={120}
                className='pointer-events-none absolute top-11 right-0 w-11 rotate-10 lg:top-24 lg:-right-2 lg:w-16'
                aria-hidden
              />
            </div>

            <div className='text-description mb-6 text-center text-xs/relaxed font-medium sm:text-base lg:mb-8 lg:text-xl/tight lg:tracking-[-0.01em] xl:mb-11 xl:text-2xl/tight'>
              <p>{EVENT_DATE_DISPLAY}</p>
              <p>{EVENT_LOCATION_DISPLAY}</p>
            </div>

            <div className='mb-8 flex w-full flex-wrap items-center justify-center gap-2 lg:mb-10 lg:gap-4'>
              {REGISTRATION_OPEN && (
                <Button
                  variant='gradient'
                  className='rounded-full px-5 py-2.5 text-sm font-semibold tracking-[-0.02em] sm:px-6 sm:py-3 sm:text-base lg:p-5 lg:text-xl'
                >
                  Register Now
                </Button>
              )}
              <Button
                variant='discord'
                className='rounded-full px-5 py-2.5 text-sm font-semibold tracking-[-0.02em] sm:px-6 sm:py-3 sm:text-base lg:p-5 lg:text-xl'
              >
                Join our Discord
              </Button>
            </div>

            <div className='text-description flex items-center justify-center gap-2 sm:gap-3'>
              <p className='text-sm font-medium text-nowrap sm:text-base lg:text-xl'>
                Powered by
              </p>
              <Image
                className='h-3.5 w-auto sm:h-4 lg:h-5'
                src={ArcurveLogo}
                alt='Arcurve'
              />
            </div>
          </div>

          <div className='relative mt-11 w-full max-w-md xl:-mt-11 xl:shrink-0'>
            <div className='mx-auto w-full max-w-md rotate-2 pt-1.5 xl:rotate-0 xl:pt-0'>
              <HeroArtwork />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
