import { HeroSection } from '@/components/hero';
import { About } from '@/components/about-section';
import { FAQ } from '@/components/faq-section';
import { Stats } from '@/components/stats-section';
import { SponsorCTA } from '@/components/sponsor-cta';
import MeetTheTeam from '@/components/meet-the-team';
import Footer from '@/components/footer';

export default function Home() {
  return (
    <>
      <div className='bg-white'>
        <HeroSection />
        <main className='mx-auto flex w-full max-w-7xl flex-col items-center gap-12 px-4 py-10 sm:gap-16 sm:py-14 lg:gap-20 lg:p-16'>
          <About />
          <Stats />
          <SponsorCTA />
          <FAQ />
        </main>
      </div>
      <MeetTheTeam />
      <Footer />
    </>
  );
}
