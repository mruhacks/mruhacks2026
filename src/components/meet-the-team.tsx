import Image from 'next/image';
import { Carousel, CarouselContent, CarouselItem } from './ui/carousel';

import Image1 from '@/assets/Badges/Badge1.png';

export default function MeetTheTeam() {
  return (
    <Carousel>
      <CarouselContent>
        <CarouselItem>
          <Image src={Image1} />
        </CarouselItem>
        <CarouselItem>Foo</CarouselItem>
        <CarouselItem>Foo</CarouselItem>
        <CarouselItem>Foo</CarouselItem>
        <CarouselItem>Foo</CarouselItem>
        <CarouselItem>Foo</CarouselItem>
      </CarouselContent>
    </Carousel>
  );
}
