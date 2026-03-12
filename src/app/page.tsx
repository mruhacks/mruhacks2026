import { HeroSection } from '@/components/hero';
import { About } from '@/components/about-section';
import { FAQ } from '@/components/faq-section';

export default function Home() {
  return (
    <div>
      <HeroSection />
      <About></About>
      <FAQ></FAQ>
    </div>
  );
}
