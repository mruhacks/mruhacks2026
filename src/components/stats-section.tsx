import { StatCard } from './stats-card';
import { StatsText, StatsDescription } from '@/content';

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
    <section className='flex w-full justify-center px-6 py-12 sm:px-8 sm:py-16 lg:px-16'>
      <div className='max-w-2xl text-center'>
        {/* pre-title */}
        <p className='text-pre-title-purple mb-2 text-sm font-semibold sm:text-base'>
          MRUHacks 2025 Recap
        </p>

        {/* main title */}
        <h1 className='mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl'>
          Look Back at MRUHacks 2025
        </h1>

        {/* description text */}
        <p className='text-description mb-6 text-base sm:mb-10 sm:text-lg'>
          {StatsDescription}
        </p>

        {/* stats carousel */}
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
    </section>
  );
}
