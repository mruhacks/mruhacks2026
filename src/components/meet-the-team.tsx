'use client';

import Image from 'next/image';
import { allMembers } from '@/assets/Badges';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from './ui/carousel';

export default function MeetTheTeam() {
  return (
    <section className='w-full bg-zinc-950 py-20'>
      <div className='mx-auto max-w-7xl px-16'>
        <h2 className='text-7xl text-white'>MRUHacks</h2>
        <h3 className='text-3xl text-white'>Meet the Team</h3>
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
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className='border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800' />
          <CarouselNext className='border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800' />
        </Carousel>
      </div>
    </section>
  );
}
