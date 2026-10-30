'use client';

import Image from 'next/image';
import { allMembers } from '@/assets/badges';
import { CarouselItem } from '@/components/ui/carousel';
import { HomeCarousel } from '@/components/home-carousel';

export default function MeetTheTeam() {
  return (
    <section className='w-full bg-zinc-950 px-4 py-10 sm:py-14 lg:py-16'>
      <div className='mx-auto max-w-7xl lg:px-16'>
        <h2 className='text-4xl font-semibold text-white sm:text-5xl lg:text-7xl'>MRUHacks</h2>
        <h3 className='mb-6 text-xl text-white sm:mb-8 sm:text-2xl lg:text-3xl'>Meet the Team</h3>
        <HomeCarousel tone='dark'>
          {allMembers.map((member) => (
            <CarouselItem key={member.name} className='sm:basis-1/2 lg:basis-1/3'>
              <Image
                src={member.image}
                alt={member.name}
                className='w-full rounded-xl'
                placeholder='blur'
                sizes='(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'
              />
            </CarouselItem>
          ))}
        </HomeCarousel>
      </div>
    </section>
  );
}
