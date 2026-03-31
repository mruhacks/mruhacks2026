'use client';

import { StatsDescription, StatsText } from '@/content';
import { StatCard } from './stats-card';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

/**
 * Stats
 *
 * A responsive section component that displays a recap of MRUHacks 2025
 * using multiple StatCard components with titles, descriptions, and images.
 *
 * @returns a styled, responsive stats section
 */
export function Stats() {
  const colors: ('purple' | 'yellow' | 'red' | 'blue' | 'skyblue')[] = [
    'purple',
    'yellow',
    'red',
    'blue',
  ];

  return (
    <>
      {/* pre-title */}
      <div className='mx-auto w-full max-w-2xl text-center'>
        <p className='text-pre-title-purple mb-2 text-sm font-semibold sm:text-base'>
          MRUHacks 2025 Recap
        </p>

        {/* main title */}
        <h1 className='mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl'>
          Look Back at MRUHacks 2025
        </h1>

        {/* description */}
        <p className='text-description mb-10 text-base sm:text-lg'>
          {StatsDescription}
        </p>
      </div>

      {/* card section*/}
      <div className='mx-auto w-full max-w-7xl'>
        <Carousel
          opts={{
            align: 'center',
            loop: true,
          }}
          className='w-full'
        >
          <CarouselContent>
            {StatsText.map((stat, index) => (
              <CarouselItem
                key={index}
                className='h-full basis-[85%] sm:basis-[45%] md:basis-[31%] lg:basis-1/4'
              >
                <StatCard
                  color={colors[index % colors.length]}
                  title={stat.stats}
                  description={stat.info}
                  image={stat.image}
                  imageWidth={stat.imageWidth}
                  imageHeight={stat.imageHeight}
                />
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious className='left-3' />
          <CarouselNext className='right-3' />
        </Carousel>
      </div>
    </>
  );
}
