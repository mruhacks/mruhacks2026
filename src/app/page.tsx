import { HeroSection } from '@/components/hero';
import { About } from '@/components/about-section';
import { FAQ } from '@/components/faq-section';
import { Stats } from '@/components/stats-section';
import { SponsorCTA } from '@/components/sponsor-cta';

export default function Home() {
  return (
    <div>
      <HeroSection />
      <About />
      <Stats />
      <SponsorCTA />
      <FAQ />
    </div>
  );
}
