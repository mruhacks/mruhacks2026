import Image from 'next/image';
import logoImage from '@/assets/logo_color_and_black.png';
import { Button } from '@/components/ui/button';
import gloveSticker from '@/assets/mruhacks-2026-stickers-glove.png';
import logoSticker from '@/assets/mruhacks-2026-stickers-logo.png';
import heroFigma from '@/assets/hero-figma.svg';

export function HeroSection() {
  return (
    <section className='relative mx-auto w-full max-w-7xl overflow-hidden px-4 pt-3 text-black md:px-6 lg:px-10 lg:pt-4'>
      <div className='flex w-full items-center justify-between pb-8 md:pb-10 lg:pb-12'>
        <div className='relative h-9 w-36 md:h-10 md:w-40 lg:h-11 lg:w-44'>
          <Image
            src={logoImage}
            alt='MRUHacks Logo'
            fill
            className='object-contain object-left'
            priority
          />
        </div>
        <Button className='h-auto rounded-full bg-black px-4 py-2 text-sm font-semibold tracking-tight text-white hover:bg-neutral-800 md:px-5 lg:px-6'>
          Register Now
        </Button>
      </div>

      <div className='mx-auto flex w-full max-w-md flex-col items-center lg:max-w-none lg:flex-row lg:items-start lg:justify-between lg:gap-12'>
        <div className='w-full lg:max-w-xl'>
          <div className='relative mb-5 w-full md:mb-6 lg:mb-7'>
            <h1 className='text-center text-4xl leading-[1.02] font-semibold tracking-[-0.03em] md:text-5xl lg:text-left lg:text-6xl'>
              <span className='whitespace-nowrap'>MRUHacks 2026</span>{' '}
            </h1>
            <Image
              src={logoSticker}
              alt='MRUHacks Logo sticker'
              width={80}
              className='pointer-events-none absolute top-14 left-0 w-10 -rotate-10 md:hidden'
              priority
            />
            <Image
              src={gloveSticker}
              alt='MRUHacks glove sticker'
              width={120}
              className='pointer-events-none absolute top-16 right-0 w-14 rotate-10 md:hidden'
              priority
            />
          </div>
          <p className='relative mb-4 inline-block text-center text-base/7 text-black/70 md:mb-5 md:text-lg/8 lg:text-left'>
            <span className='relative z-10'>
              Mount Royal University&apos;s Premier Hackathon. Now 36 Hours!
            </span>
            <svg
              className='absolute -bottom-1 left-0 z-0 h-2.5 w-full md:h-3'
              viewBox='0 0 104 9'
              fill='none'
              xmlns='http://www.w3.org/2000/svg'
              preserveAspectRatio='none'
            >
              <path
                d='M2 5.2C17.8 2.7 55.7 0.7 102 4.9'
                stroke='#0C00FD'
                strokeWidth='4'
                strokeLinecap='round'
              />
            </svg>
          </p>

          <div className='mb-6 text-center text-sm/6 font-medium text-gray-500 md:mb-7 md:text-base/7 lg:text-left'>
            <p>October 23-25, 2026</p>
            <p>In-Person Event @ Riddell Library & Learning Centre</p>
          </div>

          <div className='mb-8 flex w-full items-center justify-center gap-3 md:mb-10 md:gap-4 lg:justify-start'>
            <Button
              variant='gradient'
              className='rounded-full px-4 py-2 text-sm font-semibold tracking-tight md:px-5 md:py-2.5 md:text-base'
            >
              Register Now
            </Button>
            <Button
              variant='discord'
              className='rounded-full px-4 py-2 text-sm font-semibold tracking-tight text-black/60 md:px-5 md:py-2.5 md:text-base'
            >
              Join our Discord
            </Button>
          </div>
        </div>

        <div className='relative w-full rotate-2 pb-2 lg:ml-auto lg:max-w-xl'>
          <Image
            src={heroFigma}
            alt='MRUHacks countdown and mascot artwork'
            width={393}
            className='mx-auto w-full max-w-sm pt-4 md:max-w-md lg:max-w-xl'
            priority
          />

          <div className='pointer-events-none absolute inset-x-0 top-[6%] mx-auto w-full max-w-xs text-center md:max-w-sm lg:max-w-md lg:pt-26 lg:pr-16'>
            <p className='text-5xl leading-none font-semibold tracking-[-0.05em] text-black md:text-6xl lg:text-7xl'>
              00:00:00
            </p>
            <div className='mx-auto mt-1 grid max-w-60 grid-cols-3 text-xs font-medium tracking-[0.06em] text-black/70 uppercase md:max-w-72'>
              <span>Months</span>
              <span>Weeks</span>
              <span>Days</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
