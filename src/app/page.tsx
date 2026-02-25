import { HeroSection } from '@/components/hero';
import Link from 'next/link';

export default function Home() {
  return (
    <div>
      <HeroSection />

      <Link href='/login' className='text-5xl underline'>
        Login
      </Link>
    </div>
  );
}
