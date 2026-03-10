'use client';

import { StatCard } from './stats-card';
import { StatsText, StatsDescription } from '@/content';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const isMobile = useIsMobile();

  const colors: ('purple' | 'yellow' | 'red' | 'blue' | 'skyblue')[] = [
    'purple',
    'yellow',
    'red',
    'blue',
  ];

  return (
    <section className='w-full px-6 py-12 sm:px-8 sm:py-16 lg:px-16'>
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
        {/* mobile carousel */}
        {isMobile ? (
          <Carousel
            opts={{
              align: 'center',
              loop: true,
            }}
            className='w-full'
          >
            <CarouselContent>
              {StatsText.map((stat, index) => (
                <CarouselItem key={index} className='flex justify-center'>
                  <StatCard
                    color={colors[index % colors.length]}
                    title={stat.stats}
                    description={stat.info}
                    image={stat.image}
                    imageWidth={stat.imageWidth}
                    imageHeight={stat.imageHeight}
                    left={stat.left}
                    right={stat.right}
                    rotation={stat.rotation}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>

            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        ) : (
          /* non carousel */
          <div className='grid grid-cols-2 justify-items-center gap-8 md:gap-10 lg:grid-cols-4 lg:justify-items-stretch'>
            {StatsText.map((stat, index) => (
              <StatCard
                key={index}
                color={colors[index % colors.length]}
                title={stat.stats}
                description={stat.info}
                image={stat.image}
                imageWidth={stat.imageWidth}
                imageHeight={stat.imageHeight}
                left={stat.left}
                right={stat.right}
                rotation={stat.rotation}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
