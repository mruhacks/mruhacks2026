import Image from 'next/image';
import logoImage from '@/assets/logo_color_and_black.png';
import crtHero from '@/assets/crt_hero.png';
import { Button } from '@/components/ui/button';
import gloveSticker from '@/assets/mruhacks-2026-stickers-glove.png';
import logoSticker from '@/assets/mruhacks-2026-stickers-logo.png';
import countdownBubble from '@/assets/countdown-bubble.png';

export function HeroSection() {
  return (
    <section className='relative mx-auto flex w-full max-w-3xl flex-col items-center bg-white px-4 pt-4 text-black'>
      <div className='flex w-full items-center justify-between pb-6'>
        <div className='relative h-12 w-40'>
          <Image
            src={logoImage}
            alt='MRUHacks Logo'
            fill
            className='object-contain object-left'
            priority
          />
        </div>
        <Button className='h-auto rounded-full bg-black px-6 py-2 font-medium text-white hover:bg-neutral-800'>
          Register Now
        </Button>
      </div>

      <div className='relative mb-4 w-full'>
        <h1 className='text-center text-4xl leading-[1.1] font-bold tracking-tight md:text-6xl'>
          Mount Royal University&apos;s
          <br />
          Premier Hackathon.
          <br />
          Now{' '}
          <span className='relative inline-block'>
            <span className='relative z-10'>Three</span>
            <svg
              className='absolute bottom-[-4px] left-0 z-0 h-[6px] w-full'
              viewBox='0 0 82 5'
              fill='none'
              xmlns='http://www.w3.org/2000/svg'
              preserveAspectRatio='none'
            >
              <path
                d='M0.107778 3.08917C15.5068 1.97995 53.2924 0.350634 81.242 2.70707'
                stroke='#0C00FD'
                strokeWidth='3'
                strokeLinecap='round'
              />
            </svg>
          </span>{' '}
          Days!
        </h1>
        <Image
          src={logoSticker}
          alt='MRUHacks Logo sticker'
          width={198}
          className='pointer-events-none absolute top-1 left-1 w-10 -rotate-12 md:top-1/2 md:-left-10 md:w-15'
          priority
        />
        <Image
          src={gloveSticker}
          alt='MRUHacks glove sticker'
          width={262}
          className='pointer-events-none absolute top-1 right-1 w-12 rotate-25 md:top-1/2 md:-right-12 md:w-25'
          priority
        />
      </div>

      <div className='mb-6 text-center text-lg font-medium text-gray-500 md:text-xl'>
        <p>October 23-25, 2026</p>
        <p>In-Person Event @ Riddell Library & Learning Centre</p>
      </div>

      {/* Buttons */}
      <div className='flex w-full flex-row items-center justify-center gap-4'>
        <Button variant='gradient' size='pill'>
          Register Now
        </Button>
        <Button variant='discord' size='pill'>
          Join our Discord
        </Button>
      </div>

      <div className='w-full pt-2'>
        <Image
          src={countdownBubble}
          alt='MRUHacks glove sticker'
          width={368}
          className=''
          priority
        />
        <Image
          src={crtHero}
          alt='MRUHacks Mascot'
          width='2048'
          className='-mt-20 aspect-4/3 object-cover object-center'
          priority
        />
      </div>
    </section>
  );
}
