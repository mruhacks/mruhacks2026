import * as React from 'react';
import { redirect } from 'next/navigation';
import {
  CalendarCheck,
  CircleCheckBig,
  FileCode2,
  Gavel,
  ThumbsUp,
  Trophy,
  Users,
} from 'lucide-react';

import { getAdminEventHeader, getEventSummaryCounts } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { getJudgingTileCounts } from '@/lib/judging/server';
import { isSubmissionsEnabled } from '@/lib/submissions';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { StatTile, StatTileSkeleton } from '../../_components/stat-tile';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Sync shell. The session read and the counts live in `SummaryTiles`, behind
 * the boundary, so this cell contributes its skeleton to the static shell.
 */
export default function SummaryCell({ params }: Props) {
  return (
    <React.Suspense fallback={<SummaryTilesSkeleton />}>
      <SummaryTiles paramsPromise={params} />
    </React.Suspense>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
      {children}
    </div>
  );
}

function SummaryTilesSkeleton() {
  return (
    <TileGrid>
      {[0, 1, 2, 3].map((i) => (
        <StatTileSkeleton key={i} />
      ))}
    </TileGrid>
  );
}

async function SummaryTiles({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) return null;
  const user = await getUser();
  if (!user) redirect('/signin');

  // Each tile is gated on the permission behind the feature it summarizes —
  // never a shared "is this an admin" bundle, so a check-in volunteer with
  // no team access still sees their own tile. See AGENTS.md.
  const [
    event,
    counts,
    canReadApplications,
    canCheckIn,
    canReadTeams,
    canReadRsvp,
    canReadSubmissions,
    canManageJudging,
    canViewResults,
    canAward,
    judging,
  ] = await Promise.all([
    getAdminEventHeader(eventId),
    getEventSummaryCounts(eventId),
    hasPermission(user.id, 'application:read:all'),
    hasPermission(user.id, 'checkin:write:all'),
    hasPermission(user.id, 'team:read:all'),
    hasPermission(user.id, 'rsvp:read:all'),
    hasPermission(user.id, 'submission:read:all'),
    hasPermission(user.id, 'judging:manage:all'),
    hasPermission(user.id, 'judging:results:all'),
    hasPermission(user.id, 'judging:award:all'),
    getJudgingTileCounts(eventId),
  ]);

  if (!event) return null;

  // Built from the segment, not the uuid, so a slug URL stays a slug URL.
  const base = `/dashboard/admin/events/${segment}`;
  const showRsvp = canReadRsvp && event.hasApplication;
  const showCheckIn = canCheckIn && event.checkInEnabled;
  const showTeams = canReadTeams && event.teamsEnabled;
  const showSubmissions = canReadSubmissions && isSubmissionsEnabled(event);
  // Judging needs projects to judge, so it follows submissions being on.
  const judgingEnabled = isSubmissionsEnabled(event);
  const showJudging = canManageJudging && judgingEnabled;
  // The results page serves both the rankings and the awards controls, and
  // gates itself on either permission; the tile mirrors that.
  const showResults = (canViewResults || canAward) && judgingEnabled;

  // Nothing visible to this viewer: render no grid at all rather than an
  // empty shell.
  if (
    !canReadApplications &&
    !showCheckIn &&
    !showTeams &&
    !showRsvp &&
    !showSubmissions &&
    !showJudging &&
    !showResults
  )
    return null;

  // Every tile is a whole-card link to its tool page — no inline buttons, so
  // the tiles read identically and the click target is the obvious one.
  return (
    <TileGrid>
      {canReadApplications && (
        <StatTile
          icon={<ThumbsUp className='size-4' />}
          label={event.hasApplication ? 'Applications' : 'Registered'}
          value={(event.hasApplication
            ? counts.applications
            : counts.attendees
          ).toLocaleString()}
          href={`${base}/applications`}
        />
      )}

      {showCheckIn && (
        <StatTile
          icon={<CircleCheckBig className='size-4' />}
          label='Check-ins'
          value={counts.checkIns.toLocaleString()}
          href={`${base}/checkin`}
        />
      )}

      {showTeams && (
        <StatTile
          icon={<Users className='size-4' />}
          label='Teams'
          value={counts.teams.toLocaleString()}
          href={`${base}/teams`}
        />
      )}

      {showRsvp && (
        <StatTile
          icon={<CalendarCheck className='size-4' />}
          label="RSVP'd"
          value={counts.rsvp.accepted.toLocaleString()}
          footnote={
            <>
              <strong className='text-foreground'>{counts.rsvp.pending}</strong>{' '}
              pending ·{' '}
              <strong className='text-foreground'>
                {counts.rsvp.declined}
              </strong>{' '}
              declined
            </>
          }
          href={`${base}/rsvp`}
        />
      )}

      {showSubmissions && (
        <StatTile
          icon={<FileCode2 className='size-4' />}
          label='Projects'
          value={counts.submissions.published.toLocaleString()}
          footnote={
            <>
              <strong className='text-foreground'>
                {counts.submissions.total - counts.submissions.published}
              </strong>{' '}
              still drafts
            </>
          }
          href={`${base}/submissions`}
        />
      )}

      {showJudging && (
        <StatTile
          icon={<Gavel className='size-4' />}
          label='Judges'
          value={judging.judges.toLocaleString()}
          href={`${base}/judging`}
        />
      )}

      {showResults && (
        <StatTile
          icon={<Trophy className='size-4' />}
          label={canViewResults ? 'Judging results' : 'Awards'}
          value={judging.votes.toLocaleString()}
          footnote='votes cast'
          href={`${base}/judging/results`}
        />
      )}
    </TileGrid>
  );
}
