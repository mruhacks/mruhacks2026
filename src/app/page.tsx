import Link from 'next/link';
import { About } from '@/components/about-section';
import { FAQ } from '@/components/faq-section';
import { Stats } from '@/components/stats-section';
import { SponsorCTA } from '@/components/sponsor-cta';

export default function Home() {
  return (
    <div>
      <h1>MRUHacks2026</h1>
      <p> A super awesome home page </p>

      <Link href='/login' className='text-5xl underline'>
        Login
      </Link>
      <About></About>
      <Stats></Stats>
      <SponsorCTA></SponsorCTA>
      <FAQ></FAQ>
    </div>
  );
}
