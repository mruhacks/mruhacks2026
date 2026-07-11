import { HeroSection } from '@/components/hero';
import { About } from '@/components/about-section';
import { FAQ } from '@/components/faq-section';
import { Stats } from '@/components/stats-section';
import { SponsorCTA } from '@/components/sponsor-cta';
import MeetTheTeam from '@/components/meet-the-team';
import Footer from '@/components/footer';
import { getFeaturedEventRegisterUrl } from '@/lib/featured-event';

export default async function Home() {
  const registerUrl = await getFeaturedEventRegisterUrl();

  return (
    <>
      <div className='bg-white'>
        <HeroSection registerUrl={registerUrl} />
        <main className='mx-auto flex w-full max-w-7xl flex-col items-center gap-12 px-4 py-10 sm:gap-16 sm:py-14 lg:gap-20 lg:p-16'>
          <About registerUrl={registerUrl} />
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
