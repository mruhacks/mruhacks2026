import { HeroSection } from '@/components/hero';
import { About } from '@/components/about-section';
import { FAQ } from '@/components/faq-section';
import { Stats } from '@/components/stats-section';
import { SponsorCTA } from '@/components/sponsor-cta';
import MeetTheTeam from '@/components/meet-the-team';
import Footer from '@/components/footer';
import type { Metadata } from 'next';
import {
  getFeaturedEventRegisterUrl,
  getFeaturedEventSchedule,
} from '@/lib/featured-event';
import {
  EVENT_END_DATE,
  EVENT_START_DATE,
  EVENT_VENUE,
  MRUHACKS_LOGO_URL,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
} from '@/content';

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    images: [MRUHACKS_LOGO_URL],
  },
};

export default async function Home() {
  const [registerUrl, schedule] = await Promise.all([
    getFeaturedEventRegisterUrl(),
    getFeaturedEventSchedule(),
  ]);

  // Lets Google surface the hackathon in event search ("hackathons in
  // Calgary") for people who don't already know the name.
  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: schedule?.name ?? 'MRUHacks 2026',
    description: SITE_DESCRIPTION,
    startDate: schedule?.startsAt ?? EVENT_START_DATE.toISOString(),
    endDate: schedule?.endsAt ?? EVENT_END_DATE.toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    isAccessibleForFree: true,
    url: SITE_URL,
    image: [MRUHACKS_LOGO_URL],
    location: {
      '@type': 'Place',
      name: EVENT_VENUE.name,
      address: { '@type': 'PostalAddress', ...EVENT_VENUE.address },
    },
    organizer: { '@type': 'Organization', name: 'MRUHacks', url: SITE_URL },
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'CAD',
      availability: 'https://schema.org/InStock',
      url: new URL(registerUrl, SITE_URL).toString(),
    },
  };

  return (
    <>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(eventJsonLd).replace(/</g, '\\u003c'),
        }}
      />
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
