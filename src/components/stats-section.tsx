'use client';

import { StatsDescription, StatsText } from '@/content';
import { StatCard } from '@/components/stats-card';
import { CarouselItem } from '@/components/ui/carousel';
import { HomeCarousel } from '@/components/home-carousel';

export function Stats() {
  const colors: ('purple' | 'yellow' | 'red' | 'blue' | 'skyblue')[] = ['purple', 'yellow', 'red', 'blue'];

  return (
    <>
      <div className='mx-auto w-full max-w-2xl text-center'>
        <p className='text-pre-title-purple mb-2 text-sm font-semibold sm:text-base'>MRUHacks 2025 Recap</p>
        <h2 className='mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl'>Look Back at MRUHacks 2025</h2>
        <p className='text-description mb-6 text-base sm:mb-10 sm:text-lg'>{StatsDescription}</p>
      </div>

      <HomeCarousel>
        {StatsText.map((stat, index) => (
          <CarouselItem key={index} className='basis-[85%] sm:basis-[45%] lg:basis-1/4'>
            <StatCard
              color={colors[index % colors.length]}
              title={stat.stats}
              description={stat.info}
              image={stat.image}
            />
          </CarouselItem>
        ))}
      </HomeCarousel>
    </>
  );
}
