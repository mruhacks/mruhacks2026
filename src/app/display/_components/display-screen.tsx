'use client';

import * as React from 'react';
import Image, { type StaticImageData } from 'next/image';

import bannerBlack from '@/assets/display/banner-black.png';
import bannerWhite from '@/assets/display/banner-white.png';
// The site's Arcurve logo is a JPG cropped tight on white, which shows as a
// hard-edged strip over the Aurora; this is the original banner's version,
// framed on a rounded card.
import arcurveLogo from '@/assets/display/sponsor/Arcurve.png';
import mruIieLogo from '@/assets/display/sponsor/MRUIIE.png';
import mruLibraryLogo from '@/assets/display/sponsor/MRUL.png';
import { LocalDateRange, LocalDateTime } from '@/components/local-date-time';
import { useNow } from '@/lib/use-now';
import { getVisibleEntries, type DisplayFeed, type DisplayScheduleEntry } from '@/lib/display/schedule';
import styles from './display.module.css';

const SPONSORS: { name: string; logo: StaticImageData }[] = [
  { name: 'Arcurve', logo: arcurveLogo },
  {
    name: 'MRU Institute for Innovation and Entrepreneurship',
    logo: mruIieLogo,
  },
  { name: 'MRU Library', logo: mruLibraryLogo },
];

const BANNER_MS = 60_000;
const SPONSOR_MS = 5_000;
/** The clock shows minutes; this keeps it within a few seconds of the turn. */
const CLOCK_TICK_MS = 5_000;

type Slide = { kind: 'banner' } | { kind: 'sponsor'; index: number };

/** The banner for a minute, then each sponsor for five seconds, forever. */
function useSlide(): Slide {
  const [slide, setSlide] = React.useState<Slide>({ kind: 'banner' });

  React.useEffect(() => {
    if (SPONSORS.length === 0) return undefined;
    const timeout = window.setTimeout(
      () => {
        setSlide((current) => {
          if (current.kind === 'banner') return { kind: 'sponsor', index: 0 };
          return current.index + 1 < SPONSORS.length
            ? { kind: 'sponsor', index: current.index + 1 }
            : { kind: 'banner' };
        });
      },
      slide.kind === 'banner' ? BANNER_MS : SPONSOR_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [slide]);

  return slide;
}

const cx = (...names: (string | false)[]) => names.filter(Boolean).join(' ');

/** The screen's content; `DisplayApp` owns the shell and Aurora around it. */
export function DisplayScreen({ feed }: { feed: DisplayFeed }) {
  const slide = useSlide();
  const dark = feed.settings.theme === 'dark';

  // Both banners load eagerly so a theme switch never shows a blank; only
  // the one on screen is fetched at high priority.
  return (
    <>
      <Image
        src={bannerBlack}
        alt='MRUHacks 2026'
        loading='eager'
        fetchPriority={dark ? 'low' : 'high'}
        className={cx(styles.bannerImage, (slide.kind !== 'banner' || dark) && styles.hidden)}
      />
      <Image
        src={bannerWhite}
        alt=''
        aria-hidden
        loading='eager'
        fetchPriority={dark ? 'high' : 'low'}
        className={cx(styles.bannerImage, (slide.kind !== 'banner' || !dark) && styles.hidden)}
      />

      <section
        className={cx(styles.sponsorStage, slide.kind !== 'sponsor' && styles.hidden)}
        aria-label='Event sponsors'
      >
        {SPONSORS.map((sponsor, index) => (
          <Image
            key={sponsor.name}
            src={sponsor.logo}
            alt={sponsor.name}
            className={cx(styles.sponsorImage, !(slide.kind === 'sponsor' && slide.index === index) && styles.hidden)}
          />
        ))}
        <strong className={styles.sponsorLabel}>Brought to you by</strong>
      </section>

      {feed.settings.showClock && <ClockAndSchedule schedule={feed.schedule} />}
    </>
  );
}

function ClockAndSchedule({ schedule }: { schedule: DisplayScheduleEntry[] }) {
  const now = useNow(CLOCK_TICK_MS);
  if (now === null) return null;

  const { current, progress, ongoing, upcoming } = getVisibleEntries(schedule, now);
  const [next, ...later] = upcoming;

  return (
    <>
      <section className={styles.clockPanel} aria-label='Current time'>
        <LocalDateTime value={new Date(now)} timeOnly className={styles.clockTime} />
        <LocalDateTime value={new Date(now)} dateStyle='full' className={styles.clockDate} />
      </section>

      {(current || ongoing.length > 0 || upcoming.length > 0) && (
        <section className={styles.schedulePanel} aria-label='Event schedule'>
          {current && (
            <article className={styles.currentEvent}>
              <strong className={styles.currentEventTitle}>{current.name}</strong>
              {current.location && <span className={styles.currentEventLocation}>{current.location}</span>}
              <strong className={styles.currentEventTime}>
                <LocalDateRange start={current.startsAt} end={current.endsAt} timeOnly />
              </strong>
              {current.endsAt && (
                <div className={styles.progressTrack} aria-hidden>
                  <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
                </div>
              )}
            </article>
          )}
          {next && (
            <article className={styles.nextEvent}>
              <span className={styles.nextEventLabel}>Up next</span>
              <strong className={styles.nextEventTitle}>{next.name}</strong>
              <span className={styles.nextEventMeta}>
                <LocalDateTime value={next.startsAt} timeOnly />
                {next.location && ` · ${next.location}`}
              </span>
            </article>
          )}
          <div className={styles.scheduleUpcoming}>
            {/* Longer sessions still running under `current` (hacking during
                lunch) — still joinable, so they stay on screen. */}
            {ongoing.map((entry) => (
              <ScheduleRow key={entry.id} entry={entry}>
                {entry.endsAt ? (
                  // Long sessions often end on another day, so name it.
                  <>
                    Until <LocalDateTime value={entry.endsAt} weekday='short' timeStyle='short' />
                  </>
                ) : (
                  'Now'
                )}
              </ScheduleRow>
            ))}
            {later.map((entry) => (
              <ScheduleRow key={entry.id} entry={entry}>
                <LocalDateTime value={entry.startsAt} timeOnly />
              </ScheduleRow>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ScheduleRow({
  entry,
  children,
}: {
  entry: DisplayScheduleEntry;
  /** The row's time column. */
  children: React.ReactNode;
}) {
  return (
    <article className={styles.upcomingEvent}>
      <div className={styles.eventDetails}>
        <strong className={styles.upcomingEventTitle}>{entry.name}</strong>
        {entry.location && <span className={styles.upcomingEventLocation}>{entry.location}</span>}
      </div>
      <strong className={styles.upcomingEventTime}>{children}</strong>
    </article>
  );
}
