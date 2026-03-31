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
      <HeroSection />
      <main className='mx-auto flex w-full max-w-7xl flex-col items-center gap-20 px-6 py-16 sm:px-8 lg:px-16'>
        <About />
        <Stats />
        <SponsorCTA />
        <FAQ />
      </main>
      <MeetTheTeam />
      <Footer />
    </>
  );
}
