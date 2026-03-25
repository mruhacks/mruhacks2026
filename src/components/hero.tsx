import Image from 'next/image';
import logoImage from '@/assets/logo_color_and_black.png';
import { Button } from '@/components/ui/button';
import gloveSticker from '@/assets/mruhacks-2026-stickers-glove.png';
import logoSticker from '@/assets/mruhacks-2026-stickers-logo.png';
import heroFigma from '@/assets/hero-figma.svg';

export function HeroSection() {
  return (
    <section className='relative overflow-hidden'>
      <div className='mx-auto w-full max-w-screen-2xl px-4 pt-6 pb-12 sm:px-8 lg:px-14 lg:pt-9 lg:pb-16'>
        <div className='flex w-full items-center justify-between'>
          <div className='relative h-9 w-36 shrink-0 lg:h-16 lg:w-60'>
            <Image
              src={logoImage}
              alt='MRUHacks Logo'
              fill
              className='object-contain object-left'
              priority
            />
          </div>
          <div className='hidden items-center gap-8 lg:flex'>
            <Button
              variant='gradient'
              className='h-16 w-56 rounded-full border border-[#5e5e5e] text-3xl font-semibold tracking-[-0.02em] text-white hover:opacity-90'
            >
              Register Now
            </Button>
            <Button className='h-16 w-40 rounded-full border border-[#5e5e5e] bg-black text-3xl font-semibold tracking-[-0.02em] text-white hover:bg-neutral-800'>
              Log In
            </Button>
          </div>
          <Button className='h-auto shrink-0 rounded-full bg-black px-5 py-2.5 text-sm font-semibold tracking-tight text-white hover:bg-neutral-800 lg:hidden'>
            Register Now
          </Button>
        </div>

        <div className='mx-auto mt-8 flex w-full max-w-md flex-col items-center lg:mt-36 lg:max-w-none lg:flex-row lg:items-start lg:justify-between lg:gap-8'>
          <div className='w-full lg:max-w-2xl'>
            <div className='relative mb-6 w-full'>
              <h1 className='flex flex-col items-center px-4 text-center text-4xl/tight font-semibold tracking-[-0.03em] sm:px-14 sm:text-5xl lg:px-0 lg:text-6xl lg:tracking-[-0.04em]'>
                <span className='inline-flex items-center justify-center whitespace-nowrap'>
                  Mount Royal University&apos;s
                </span>
                <span className='inline-flex items-center justify-center'>
                  Premier Hackathon.
                </span>
                <span className='relative inline-flex items-center justify-center'>
                  Now Three Days!
                  <svg
                    className='absolute -bottom-0.5 left-0 z-0 h-2.5 w-full lg:-bottom-1 lg:h-3'
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
                className='pointer-events-none absolute top-12 left-0 w-10 -rotate-10 lg:top-24 lg:-left-2 lg:w-16'
                priority
                aria-hidden
              />
              <Image
                src={gloveSticker}
                alt=''
                width={120}
                className='pointer-events-none absolute top-14 right-0 w-14 rotate-10 lg:top-28 lg:-right-2 lg:w-20'
                priority
                aria-hidden
              />
            </div>

            <div className='mb-8 text-center text-sm/relaxed font-medium text-description sm:text-xl lg:mb-14 lg:text-3xl/tight lg:tracking-[-0.01em]'>
              <p className='lg:text-3xl'>October 23-25, 2026</p>
              <p className='lg:text-3xl'>In-Person Event @ Riddell Library</p>
            </div>

            <div className='mb-10 flex w-full flex-wrap items-center justify-center gap-3 lg:mb-12 lg:gap-5'>
              <Button
                variant='gradient'
                className='h-16 w-56 rounded-full px-5 py-2.5 text-2xl font-semibold tracking-[-0.02em]'
              >
                Register Now
              </Button>
              <Button
                variant='discord'
                className='h-16 w-64 rounded-full px-5 py-2.5 text-2xl font-semibold tracking-[-0.02em]'
              >
                Join our Discord
              </Button>
            </div>

            <div className='flex items-center justify-center gap-4 text-description lg:justify-start lg:pl-20'>
              <p className='text-2xl font-medium lg:text-3xl'>Powered by</p>

            </div>
          </div>

          <div className='relative w-full max-w-xl lg:-mt-14 lg:shrink-0'>
            <Image
              src={heroFigma}
              alt='MRUHacks countdown and mascot artwork'
              width={525}
              height={710}
              className='mx-auto w-full max-w-lg rotate-2 pt-2 lg:rotate-0 lg:pt-0'
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
