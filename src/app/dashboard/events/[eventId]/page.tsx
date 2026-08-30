import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { events, eventTypes, eventAttendees, eventArticles } from '@/db/schema';
import {
  getUserApplicationStatus,
  type ApplicationStatusForUser,
} from '@/app/dashboard/events/actions';
import { ApplicationStatusBanner } from '@/app/dashboard/events/ApplicationStatusBanner';
import { EventWikiDialog } from '@/app/dashboard/events/event-wiki-dialog';
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
  name: string;
  descriptionMarkdown: string | null;
  hasApplication: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  capacity: number | null;
  teamsEnabled: boolean;
  eventTypeLabel: string | null;
};

type PublishedArticle = { slug: string; title: string };

function formatDate(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d);
}

function formatDateShort(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}

function dateRange(startsAt: Date | null, endsAt: Date | null) {
  if (!startsAt) return 'Date TBA';
  const start = formatDateShort(startsAt);
  const end = endsAt ? formatDateShort(endsAt) : null;
  return end && end !== start
    ? `${start} – ${end}`
    : (formatDate(startsAt) ?? start);
}

export default async function EventEntryPage({ params, searchParams }: Props) {
  const { eventId } = await params;
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
      name: events.name,
      descriptionMarkdown: events.descriptionMarkdown,
      hasApplication: events.hasApplication,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      capacity: events.capacity,
      teamsEnabled: events.teamsEnabled,
      eventTypeLabel: eventTypes.label,
    })
    .from(events)
    .leftJoin(eventTypes, eq(events.eventTypeId, eventTypes.id))
    .where(eq(events.id, eventId))
    .limit(1);

  if (!row) notFound();

  const publishedArticles = await db
    .select({ slug: eventArticles.slug, title: eventArticles.title })
    .from(eventArticles)
    .where(
      and(
        eq(eventArticles.eventId, eventId),
        eq(eventArticles.published, true),
      ),
    )
    .orderBy(asc(eventArticles.sortOrder), asc(eventArticles.title));

  if (row.hasApplication) {
    const applicationStatus = await getUserApplicationStatus(eventId);
    const canManageTeam =
      row.teamsEnabled &&
      applicationStatus != null &&
      applicationStatus.statusKey !== 'denied';

    return (
      <EventPageLayout
        event={row}
        articles={publishedArticles}
        mobileAction={
          applicationStatus?.statusDisplay.isFinal
            ? null
            : applicationStatus
              ? {
                  label: 'Edit application',
                  href: `/dashboard/events/${eventId}/apply`,
                }
              : {
                  label: 'Start application',
                  href: `/dashboard/events/${eventId}/apply`,
                }
        }
        participation={
          <ApplicationParticipationPanel
            eventId={eventId}
            applicationStatus={applicationStatus}
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
      articles={publishedArticles}
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
  articles,
  participation,
  team,
  mobileAction,
}: {
  event: EventDetails;
  articles: PublishedArticle[];
  participation: React.ReactNode;
  team: React.ReactNode;
  mobileAction:
    | { label: string; href: string; control?: never }
    | { label: string; control: React.ReactNode; href?: never }
    | null;
}) {
  return (
    <div className='pb-24 lg:pb-0'>
      <BreadcrumbSegment id={event.id} label={event.name} />

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
          <EventTypeTag
            label={event.eventTypeLabel}
            hasApplication={event.hasApplication}
          />
          <EventMeta
            startsAt={event.startsAt}
            endsAt={event.endsAt}
            capacity={event.capacity}
          />
        </div>
      </header>

      <div className='mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start'>
        <main className='flex min-w-0 flex-col gap-8'>
          <EventDescription markdown={event.descriptionMarkdown} />
          <WikiArticles eventId={event.id} articles={articles} />
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
  return <EventTicketButton eventId={eventId} />;
}

function ApplicationParticipationPanel({
  eventId,
  applicationStatus,
  walletPlatform,
}: {
  eventId: string;
  applicationStatus: ApplicationStatusForUser | null;
  walletPlatform: WalletPlatform;
}) {
  if (applicationStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
        </CardHeader>
        <CardContent>
          <ApplicationStatusBanner
            application={applicationStatus}
            editHref={`/dashboard/events/${eventId}/apply`}
          />
        </CardContent>
        {applicationStatus.statusKey === 'approved' && (
          <CardFooter>
            <WalletAction eventId={eventId} walletPlatform={walletPlatform} />
          </CardFooter>
        )}
      </Card>
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
          <Link href={`/dashboard/events/${eventId}/apply`}>
            Start application
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function RegistrationParticipationPanel({
  eventId,
  isRegistered,
  walletPlatform,
}: {
  eventId: string;
  isRegistered: boolean;
  walletPlatform: WalletPlatform;
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
          <WalletAction eventId={eventId} walletPlatform={walletPlatform} />
          <p className='text-muted-foreground text-center text-xs'>
            Tip: add your pass on your phone for faster check-in.
          </p>
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
  eventId,
  articles,
}: {
  eventId: string;
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
            Event wiki
          </h2>
        </div>
        <EventWikiDialog eventId={eventId} articles={articles} />
      </div>
      <Card>
        <CardContent className='flex flex-col gap-0 p-0'>
          {articles.map((article, index) => (
            <div key={article.slug}>
              {index > 0 && <Separator />}
              <Link
                href={`/dashboard/events/${eventId}/wiki/${article.slug}`}
                className='hover:bg-accent flex items-center justify-between gap-3 px-6 py-4 text-sm font-medium transition-colors'
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

function EventTypeTag({
  label,
  hasApplication,
}: {
  label: string | null;
  hasApplication: boolean;
}) {
  const display = label
    ? label.charAt(0).toUpperCase() + label.slice(1)
    : hasApplication
      ? 'Application required'
      : 'Open registration';
  return (
    <Badge variant='outline' className='text-muted-foreground'>
      {display}
    </Badge>
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
          {dateRange(startsAt, endsAt)}
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
