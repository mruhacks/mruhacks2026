'use client';

import Image from 'next/image';
import { allMembers } from '@/assets/badges';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from './ui/carousel';

export default function MeetTheTeam() {
  return (
    <section className='w-full bg-zinc-950 px-4 py-10 sm:py-14 lg:py-16'>
      <div className='mx-auto max-w-7xl lg:px-16'>
        <h2 className='text-4xl font-semibold text-white sm:text-5xl lg:text-7xl'>
          MRUHacks
        </h2>
        <h3 className='mb-6 text-xl text-white sm:mb-8 sm:text-2xl lg:text-3xl'>
          Meet the Team
        </h3>
        <Carousel opts={{ align: 'start', loop: true }}>
          <CarouselContent>
            {allMembers.map((member) => (
              <CarouselItem
                key={member.name}
                className='basis-full sm:basis-1/3 lg:basis-1/3'
              >
                <Image
                  src={member.image}
                  alt={member.name}
                  className='w-full rounded-xl'
                  placeholder='blur'
                  sizes='(min-width: 640px) 33vw, 100vw'
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className='left-1 border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 sm:left-2' />
          <CarouselNext className='right-1 border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 sm:right-2' />
        </Carousel>
      </div>
    </section>
  );
}
