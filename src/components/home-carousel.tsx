'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Carousel, CarouselContent, CarouselNext, CarouselPrevious, useCarousel } from '@/components/ui/carousel';

type Tone = 'light' | 'dark';

// Shared carousel for the homepage sections. The prev/next buttons never float
// over the slides: on phones and tablets they wrap into a row under the track,
// and from `lg` up they sit beside it. When every slide already fits (e.g. the
// four stat cards on desktop) the side buttons turn invisible but keep their
// space, so the track doesn't jump in width when the carousel hydrates.
export function HomeCarousel({ children, tone = 'light' }: { children: ReactNode; tone?: Tone }) {
  return (
    <Carousel
      opts={{ align: 'start', loop: true }}
      className='flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-4 sm:gap-y-6 lg:flex-nowrap lg:gap-x-4'
    >
      <SideButton tone={tone} side='prev' />
      <div className='order-first min-w-0 basis-full lg:order-0 lg:flex-1 lg:basis-auto'>
        <CarouselContent>{children}</CarouselContent>
      </div>
      <SideButton tone={tone} side='next' />
    </Carousel>
  );
}

function SideButton({ tone, side }: { tone: Tone; side: 'prev' | 'next' }) {
  const { canScrollPrev, canScrollNext } = useCarousel();
  const Button = side === 'prev' ? CarouselPrevious : CarouselNext;

  return (
    <Button
      className={cn(
        'static size-10 shrink-0 translate-y-0',
        !canScrollPrev && !canScrollNext && 'max-lg:hidden lg:invisible',
        tone === 'dark' && 'border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white',
      )}
    />
  );
}
