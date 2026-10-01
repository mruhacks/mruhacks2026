import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import {
  events,
  eventTypes,
  eventAttendees,
  eventArticles,
  eventTerms,
} from '@/db/schema';
import { resolveEventId } from '@/lib/events';
import { eventPath } from '@/lib/event-slug';
import { isScheduleVisible, listSubevents } from '@/lib/subevents';
import { serializeInstant } from '@/lib/datetime';
import {
  EventSchedule,
  type ScheduleEntry,
} from '@/app/dashboard/events/[eventId]/event-schedule';
import {
  getUserApplicationStatus,
  getUserRsvpStatus,
  type ApplicationStatusForUser,
  type RsvpStatusForUser,
} from '@/app/dashboard/events/actions';
import { APPLICATION_TIMELINE_LABELS } from '@/app/dashboard/events/application-status';
import { RsvpStatusCard } from '@/app/dashboard/events/RsvpStatusCard';
import { EventParticipationStatusCard } from '@/app/dashboard/events/EventParticipationStatusCard';
import { RsvpPendingPrompt } from '@/app/dashboard/events/RsvpPendingPrompt';
import { LocalDateRange, LocalDateTime } from '@/components/local-date-time';
import { RegisterEventButton } from '@/app/dashboard/events/RegisterEventButton';
import { UnregisterEventButton } from '@/app/dashboard/events/UnregisterEventButton';
import { TeamPanel } from '@/app/dashboard/events/team/TeamPanel';
import { AddToWalletButton } from '@/components/add-to-wallet-button';
import { AddToGoogleWalletButton } from '@/components/add-to-google-wallet-button';
import { EventTicketButton } from '@/components/event-ticket-button';
import {
  detectWalletPlatform,
  type WalletPlatform,
} from '@/lib/wallet/detect-platform';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Users,
} from 'lucide-react';

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type EventDetails = {
  id: string;
  slug: string | null;
  name: string;
  descriptionMarkdown: string | null;
  termsMarkdown: string | null;
  termsId: string | null;
  hasApplication: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  capacity: number | null;
  capacityVisible: boolean;
  teamsEnabled: boolean;
  eventTypeLabel: string | null;
};

type PublishedArticle = { slug: string; title: string };

function EventPageSkeleton() {
  return (
    <div className='flex flex-col gap-8'>
      <div className='flex flex-col gap-3'>
        <div className='bg-muted h-4 w-24 animate-pulse rounded' />
        <div className='bg-muted h-10 w-2/3 animate-pulse rounded' />
        <div className='bg-muted h-4 w-40 animate-pulse rounded' />
      </div>
      <div className='bg-muted h-48 animate-pulse rounded-lg' />
    </div>
  );
}

/**
 * Sync shell so Cache Components can serve the App Shell immediately.
 * Session, headers, and DB reads live in `EventEntryContent` behind Suspense
 * — same pattern as `dashboard/page.tsx`. An async page default export is
 * what triggered the blocking-prerender error on this route.
 */
export const instant = false;

export default function EventEntryPage(props: Props) {
  return (
    <Suspense fallback={<EventPageSkeleton />}>
      <EventEntryContent {...props} />
    </Suspense>
  );
}

async function EventEntryContent({ params, searchParams }: Props) {
  // The segment is either the event's uuid or its custom slug; everything
  // below queries by the resolved uuid, while links are rebuilt from the
  // event's canonical path so a configured slug is what participants share.
  const { eventId: segment } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const { joinCode: rawJoinCode } = await searchParams;
  // A repeated `?joinCode=` (a double-appended share link) arrives as an
  // array; take the first so the dialog always gets a plain code string.
  const joinCode = Array.isArray(rawJoinCode) ? rawJoinCode[0] : rawJoinCode;
  const user = await getUser();
  if (!user) redirect('/signin');

  const walletPlatform = await detectWalletPlatform();

  const [row] = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      parentEventId: events.parentEventId,
      descriptionMarkdown: events.descriptionMarkdown,
      termsMarkdown: eventTerms.markdown,
      termsId: events.termsId,
      hasApplication: events.hasApplication,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      checkInEnabled: events.checkInEnabled,
      capacity: events.capacity,
      capacityVisible: events.capacityVisible,
      teamsEnabled: events.teamsEnabled,
      eventTypeLabel: eventTypes.label,
    })
    .from(events)
    .leftJoin(eventTerms, eq(events.termsId, eventTerms.id))
    .leftJoin(eventTypes, eq(events.eventTypeId, eventTypes.id))
    .where(eq(events.id, eventId))
    .limit(1);

  if (!row) notFound();

  // A sub-event has no page of its own — no registration, no application, no
  // pass — it's a row on its parent's schedule. Redirect rather than 404: the
  // thing being asked for does exist, just one level up.
  if (row.parentEventId) {
    redirect(`/dashboard/events/${row.parentEventId}`);
  }

  const eventHref = eventPath(row);

  const [publishedArticlesRows, subeventRows] = await Promise.all([
    db
      .select({ slug: eventArticles.slug, title: eventArticles.title })
      .from(eventArticles)
      .where(
        and(
          eq(eventArticles.eventId, eventId),
          eq(eventArticles.published, true),
        ),
      )
      .orderBy(asc(eventArticles.sortOrder), asc(eventArticles.title)),
    listSubevents(eventId),
  ]);

  // Incomplete sub-events are held back from the schedule rather than filtered
  // out of the getter, so the admin list and this page share one cache entry.
  const schedule: ScheduleEntry[] = subeventRows
    .filter(isScheduleVisible)
    .map((subevent) => ({
      id: subevent.id,
      name: subevent.name,
      // Non-null by `isScheduleVisible`; serialized because a Date must never
      // cross into a client component.
      startsAt: serializeInstant(subevent.startsAt!),
      endsAt: serializeInstant(subevent.endsAt),
      descriptionMarkdown: subevent.descriptionMarkdown,
      location: subevent.location,
    }));

  // Event Terms isn't a real article — it's synthesized onto the end of the
  // list so it's always reachable from the wiki without living in
  // `eventArticles` (whose slugs are freely editable by organizers).
  const publishedArticles: PublishedArticle[] = row.termsId
    ? [...publishedArticlesRows, { slug: 'terms', title: 'Event Terms' }]
    : publishedArticlesRows;

  if (row.hasApplication) {
    const [applicationStatus, rsvpStatus] = await Promise.all([
      getUserApplicationStatus(eventId),
      getUserRsvpStatus(eventId),
    ]);
    const canManageTeam =
      row.teamsEnabled &&
      applicationStatus != null &&
      applicationStatus.statusKey !== 'denied';

    return (
      <EventPageLayout
        event={row}
        segment={segment}
        articles={publishedArticles}
        schedule={schedule}
        mobileAction={
          // An outstanding RSVP is the one thing we want a phone visitor to
          // act on, and its buttons live in the panel — so no sticky bar.
          rsvpStatus || applicationStatus?.statusDisplay.isFinal
            ? null
            : applicationStatus
              ? {
                  label: 'Edit application',
                  href: `${eventHref}/apply`,
                }
              : {
                  label: 'Start application',
                  href: `${eventHref}/apply`,
                }
        }
        participation={
          <ApplicationParticipationPanel
            eventId={eventId}
            eventHref={eventHref}
            eventName={row.name}
            termsMarkdown={row.termsMarkdown}
            termsId={row.termsId}
            checkInEnabled={row.checkInEnabled}
            applicationStatus={applicationStatus}
            rsvpStatus={rsvpStatus}
            walletPlatform={walletPlatform}
          />
        }
        team={
          canManageTeam ? (
            <TeamPanel eventId={eventId} joinCode={joinCode} />
          ) : null
        }
      />
    );
  }

  const [attendeeRow] = await db
    .select({ userId: eventAttendees.userId })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.userId, user.id),
      ),
    )
    .limit(1);

  const isRegistered = Boolean(attendeeRow);

  return (
    <EventPageLayout
      event={row}
      segment={segment}
      articles={publishedArticles}
      schedule={schedule}
      mobileAction={
        isRegistered
          ? null
          : {
              label: 'Register',
              control: (
                <RegisterEventButton eventId={eventId} className='w-full' />
              ),
            }
      }
      participation={
        <RegistrationParticipationPanel
          eventId={eventId}
          checkInEnabled={row.checkInEnabled}
          isRegistered={isRegistered}
          walletPlatform={walletPlatform}
        />
      }
      team={
        isRegistered && row.teamsEnabled ? (
          <TeamPanel eventId={eventId} joinCode={joinCode} />
        ) : null
      }
    />
  );
}

function EventPageLayout({
  event,
  segment,
  articles,
  schedule,
  participation,
  team,
  mobileAction,
}: {
  event: EventDetails;
  /**
   * The `[eventId]` segment exactly as it appears in the current URL — the
   * breadcrumb is keyed by path segment, so it has to be the visitor's form
   * (uuid or slug) rather than the canonical one.
   */
  segment: string;
  articles: PublishedArticle[];
  schedule: ScheduleEntry[];
  participation: React.ReactNode;
  team: React.ReactNode;
  mobileAction:
    | { label: string; href: string; control?: never }
    | { label: string; control: React.ReactNode; href?: never }
    | null;
}) {
  return (
    <div className='pb-24 lg:pb-0'>
      <BreadcrumbSegment id={segment} label={event.name} />

      <header className='flex flex-col gap-3'>
        <Button
          asChild
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-2 w-fit'
        >
          <Link href='/dashboard'>
            <ArrowLeft data-icon='inline-start' />
            My events
          </Link>
        </Button>
        <div className='flex flex-col gap-2'>
          <h1 className='text-3xl font-semibold tracking-tight sm:text-4xl'>
            {event.name}
          </h1>
          <EventMeta
            startsAt={event.startsAt}
            endsAt={event.endsAt}
            capacity={event.capacityVisible ? event.capacity : null}
          />
        </div>
      </header>

      <div className='mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start'>
        <main className='flex min-w-0 flex-col gap-8'>
          <EventDescription markdown={event.descriptionMarkdown} />
          {/* Between the blurb and the wiki: the description says what this is,
              the schedule is the "when and where" participants come back to,
              and the wiki is reference material they navigate to deliberately. */}
          <EventSchedule entries={schedule} />
          <WikiArticles eventHref={eventPath(event)} articles={articles} />
        </main>

        <aside className='order-first flex flex-col gap-4 lg:sticky lg:top-24 lg:order-0 lg:self-start'>
          {participation}
          {team}
        </aside>
      </div>

      {mobileAction && (
        <div className='bg-background fixed inset-x-0 bottom-0 border-t p-4 shadow-lg lg:hidden'>
          {mobileAction.href ? (
            <Button asChild className='w-full' size='lg'>
              <Link href={mobileAction.href}>{mobileAction.label}</Link>
            </Button>
          ) : (
            mobileAction.control
          )}
        </div>
      )}
    </div>
  );
}

/** Shows exactly one wallet action, picked by the visitor's detected platform. */
function WalletAction({
  eventId,
  walletPlatform,
}: {
  eventId: string;
  walletPlatform: WalletPlatform;
}) {
  if (walletPlatform === 'apple')
    return <AddToWalletButton eventId={eventId} />;
  if (walletPlatform === 'google')
    return <AddToGoogleWalletButton eventId={eventId} />;
}

function ApplicationParticipationPanel({
  eventId,
  eventHref,
  eventName,
  applicationStatus,
  termsMarkdown,
  termsId,
  rsvpStatus,
  walletPlatform,
  checkInEnabled,
}: {
  eventId: string;
  eventHref: string;
  eventName: string;
  termsMarkdown: string | null;
  termsId: string | null;
  applicationStatus: ApplicationStatusForUser | null;
  rsvpStatus: RsvpStatusForUser | null;
  walletPlatform: WalletPlatform;
  checkInEnabled: boolean;
}) {
  // Any latest-wave RSVP (pending, accepted, declined, timed_out) is the
  // status of record — same precedence as the dashboard listing badges.
  if (rsvpStatus) {
    return (
      <>
        {rsvpStatus.statusLabel === 'pending' && (
          <RsvpPendingPrompt
            eventId={eventId}
            eventName={eventName}
            termsMarkdown={termsMarkdown}
            termsId={termsId}
            respondBy={rsvpStatus.respondBy}
          />
        )}
        <RsvpStatusCard
          eventId={eventId}
          eventName={eventName}
          rsvp={rsvpStatus}
          termsMarkdown={termsMarkdown}
          termsId={termsId}
        />
        {checkInEnabled && rsvpStatus.statusLabel === 'accepted' && (
          <Card>
            <CardHeader>
              <CardTitle>Your pass</CardTitle>
              <CardDescription>
                Add it to your phone for faster check-in.
              </CardDescription>
            </CardHeader>
            <CardFooter className='flex flex-row gap-2'>
              <WalletAction eventId={eventId} walletPlatform={walletPlatform} />
              <EventTicketButton eventId={eventId} />
            </CardFooter>
          </Card>
        )}
      </>
    );
  }

  if (applicationStatus) {
    const { statusDisplay: display, createdAt } = applicationStatus;
    const showEdit = !display.isFinal;
    const isApproved = applicationStatus.statusKey === 'approved';
    return (
      <EventParticipationStatusCard
        title='Application'
        badgeLabel={display.title}
        badgeVariant={display.variant}
        description={display.description}
        infoRows={
          createdAt
            ? [
                {
                  key: 'submitted',
                  content: (
                    <>
                      {APPLICATION_TIMELINE_LABELS.submitted}{' '}
                      <LocalDateTime
                        value={createdAt}
                        dateStyle='medium'
                        timeStyle='short'
                      />
                    </>
                  ),
                },
              ]
            : []
        }
        footer={
          showEdit || (isApproved && checkInEnabled) ? (
            <>
              {showEdit && (
                <Button asChild size='sm' variant='outline'>
                  <Link href={`${eventHref}/apply`}>Edit application</Link>
                </Button>
              )}
              {isApproved && checkInEnabled && (
                <>
                  <WalletAction
                    eventId={eventId}
                    walletPlatform={walletPlatform}
                  />
                  <EventTicketButton eventId={eventId} />
                </>
              )}
            </>
          ) : undefined
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application</CardTitle>
        <CardDescription>
          This event uses an application process. Tell us a little about
          yourself — spots are limited and reviewed by our team.
        </CardDescription>
      </CardHeader>
      <CardFooter className='flex-col gap-2'>
        <Button asChild className='w-full' size='lg'>
          <Link href={`${eventHref}/apply`}>Start application</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function RegistrationParticipationPanel({
  eventId,
  isRegistered,
  walletPlatform,
  checkInEnabled,
}: {
  eventId: string;
  isRegistered: boolean;
  walletPlatform: WalletPlatform;
  checkInEnabled: boolean;
}) {
  if (isRegistered) {
    return (
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle>You&apos;re registered</CardTitle>
            <Badge variant='success'>Registered</Badge>
          </div>
          <CardDescription>
            Your spot is confirmed. We&apos;ll see you there!
          </CardDescription>
        </CardHeader>
        <CardFooter className='flex-col gap-2'>
          {checkInEnabled && (
            <>
              <div className='flex flex-row gap-2'>
                <WalletAction
                  eventId={eventId}
                  walletPlatform={walletPlatform}
                />
                <EventTicketButton eventId={eventId} />
              </div>
              <p className='text-muted-foreground text-center text-xs'>
                Tip: add your pass on your phone for faster check-in.
              </p>
            </>
          )}
          <UnregisterEventButton eventId={eventId} className='w-full' />
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration</CardTitle>
        <CardDescription>
          No application required — register now to save your spot.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <RegisterEventButton eventId={eventId} className='w-full' />
      </CardFooter>
    </Card>
  );
}

function EventDescription({ markdown }: { markdown: string | null }) {
  if (!markdown?.trim()) return null;
  return (
    <Card>
      <CardContent>
        <MarkdownContent markdown={markdown} />
      </CardContent>
    </Card>
  );
}

/** Shows the existing published wiki content directly on the event page. */
function WikiArticles({
  eventHref,
  articles,
}: {
  eventHref: string;
  articles: PublishedArticle[];
}) {
  if (articles.length === 0) return null;
  return (
    <section
      aria-labelledby='event-wiki-heading'
      className='flex flex-col gap-4'
    >
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <BookOpen className='size-4' aria-hidden />
          <h2 id='event-wiki-heading' className='text-xl font-semibold'>
            Hackerpack
          </h2>
        </div>
        <Button asChild size='sm' variant='ghost'>
          <Link href={`${eventHref}/wiki`}>View all</Link>
        </Button>
      </div>
      <Card className='overflow-hidden py-0'>
        <CardContent className='flex flex-col gap-0 p-0'>
          {articles.map((article, index) => (
            <div key={article.slug}>
              {index > 0 && <Separator />}
              <Link
                href={`${eventHref}/wiki/${article.slug}`}
                className='hover:bg-accent flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors'
              >
                <span>{article.title}</span>
                <ArrowRight className='text-muted-foreground size-4 shrink-0' />
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function EventMeta({
  startsAt,
  endsAt,
  capacity,
}: {
  startsAt: Date | null;
  endsAt: Date | null;
  capacity: number | null;
}) {
  return (
    <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm'>
      {(startsAt || endsAt) && (
        <span className='flex items-center gap-1.5'>
          <CalendarDays className='size-4 shrink-0' aria-hidden />
          <LocalDateRange
            start={startsAt}
            end={endsAt}
            singleDateStyle='long'
            singleTimeStyle='short'
          />
        </span>
      )}
      {capacity != null && (
        <span className='flex items-center gap-1.5'>
          <Users className='size-4 shrink-0' aria-hidden />
          {capacity} spots
        </span>
      )}
    </div>
  );
}
