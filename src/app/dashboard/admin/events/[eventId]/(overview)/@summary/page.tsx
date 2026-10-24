import * as React from 'react';
import { redirect } from 'next/navigation';
import { CalendarCheck, CircleCheckBig, Gavel, ThumbsUp, Trophy, Users, Utensils } from 'lucide-react';

import { getAdminEventHeader, getEventSummaryCounts } from '@/lib/admin-event';
import * as Dietary from '@/lib/dietary/server';
import { resolveEventId } from '@/lib/events';
import * as Judging from '@/lib/judging/server';
import { isSubmissionsEnabled, type SubmissionEventFields } from '@/lib/submissions';
import * as Rbac from '@/lib/rbac/server';
import { getUser } from '@/utils/auth';

import { StatTile, StatTileSkeleton } from '@/app/dashboard/admin/events/[eventId]/_components/stat-tile';

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
  return <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5'>{children}</div>;
}

function SummaryTilesSkeleton() {
  return (
    <TileGrid>
      {[0, 1, 2, 3, 4].map((i) => (
        <StatTileSkeleton key={i} />
      ))}
    </TileGrid>
  );
}

type JudgingTilePermissions = {
  canManage: boolean;
  canViewResults: boolean;
  canAward: boolean;
};

function judgingTileVisibility(
  event: SubmissionEventFields,
  { canManage, canViewResults, canAward }: JudgingTilePermissions,
) {
  // Judging needs projects to judge, so it follows submissions being on.
  const judgingEnabled = isSubmissionsEnabled(event);
  return {
    showJudging: canManage && judgingEnabled,
    // The results page serves both the rankings and the awards controls, and
    // gates itself on either permission; the tile mirrors that.
    showResults: (canViewResults || canAward) && judgingEnabled,
  };
}

async function SummaryTiles({ paramsPromise }: { paramsPromise: Promise<{ eventId: string }> }) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) return null;
  const user = await getUser();
  if (!user) redirect('/signin');

  // Each tile is gated on the permission behind the feature it summarizes —
  // never a shared "is this an admin" bundle, so a check-in volunteer with
  // no team access still sees their own tile. See AGENTS.md.
  const eventPromise = getAdminEventHeader(eventId);
  const canManageJudgingPromise = Rbac.hasPermission(user.id, 'judging:manage:all');
  const canViewResultsPromise = Rbac.hasPermission(user.id, 'judging:results:all');
  const canAwardPromise = Rbac.hasPermission(user.id, 'judging:award:all');
  // The judging counts only feed the Judges and results tiles, so they're
  // fetched only once those tiles are known to be visible — chained off the
  // same checks rather than awaited after them, so a viewer who does see
  // them pays no extra round trip.
  const judgingPromise = Promise.all([
    eventPromise,
    canManageJudgingPromise,
    canViewResultsPromise,
    canAwardPromise,
  ]).then(([ev, canManage, canViewResults, canAward]) => {
    if (!ev) return null;
    const visible = judgingTileVisibility(ev, {
      canManage,
      canViewResults,
      canAward,
    });
    return visible.showJudging || visible.showResults ? Judging.getJudgingTileCounts(eventId) : null;
  });

  const [
    event,
    counts,
    dietaryExpected,
    canReadApplications,
    canCheckIn,
    canReadTeams,
    canReadRsvp,
    canReadDietary,
    canReadSubmissions,
    canManageJudging,
    canViewResults,
    canAward,
    judging,
  ] = await Promise.all([
    eventPromise,
    getEventSummaryCounts(eventId),
    Dietary.getDietaryExpectedCount(eventId),
    Rbac.hasPermission(user.id, 'application:read:all'),
    Rbac.hasPermission(user.id, 'checkin:write:all'),
    Rbac.hasPermission(user.id, 'team:read:all'),
    Rbac.hasPermission(user.id, 'rsvp:read:all'),
    Rbac.hasPermission(user.id, 'dietary:read:all'),
    Rbac.hasPermission(user.id, 'submission:read:all'),
    canManageJudgingPromise,
    canViewResultsPromise,
    canAwardPromise,
    judgingPromise,
  ]);

  if (!event) return null;

  // Built from the segment, not the uuid, so a slug URL stays a slug URL.
  const base = `/dashboard/admin/events/${segment}`;
  const showRsvp = canReadRsvp && event.hasApplication;
  const showCheckIn = canCheckIn && event.checkInEnabled;
  const showTeams = canReadTeams && event.teamsEnabled;
  const showSubmissions = canReadSubmissions && isSubmissionsEnabled(event);
  const { showJudging, showResults } = judgingTileVisibility(event, {
    canManage: canManageJudging,
    canViewResults,
    canAward,
  });
  // Teams, their projects and the projects' expo tables share one screen and
  // one tile; any of those permissions shows it, and each part of the screen
  // follows its own.
  const showProjects = showSubmissions || showJudging;

  // Nothing visible to this viewer: render no grid at all rather than an
  // empty shell.
  if (
    !canReadApplications &&
    !showCheckIn &&
    !showTeams &&
    !showRsvp &&
    !canReadDietary &&
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
          value={(event.hasApplication ? counts.applications : counts.attendees).toLocaleString()}
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

      {canReadDietary && (
        <StatTile
          icon={<Utensils className='size-4' />}
          label='Dietary'
          value={dietaryExpected.toLocaleString()}
          footnote='expected for catering'
          href={`${base}/dietary`}
        />
      )}

      {(showTeams || showProjects) && (
        <StatTile
          icon={<Users className='size-4' />}
          label={showTeams ? 'Teams' : 'Projects'}
          value={(showTeams ? counts.teams : counts.submissions.published).toLocaleString()}
          footnote={
            showProjects ? (
              <>
                {showTeams && (
                  <>
                    <strong className='text-foreground'>{counts.submissions.published}</strong> projects ·{' '}
                  </>
                )}
                <strong className='text-foreground'>{counts.submissions.total - counts.submissions.published}</strong>{' '}
                still drafts
              </>
            ) : undefined
          }
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
              <strong className='text-foreground'>{counts.rsvp.pending}</strong> pending ·{' '}
              <strong className='text-foreground'>{counts.rsvp.declined}</strong> declined
            </>
          }
          href={`${base}/rsvp`}
        />
      )}

      {showJudging && judging && (
        <StatTile
          icon={<Gavel className='size-4' />}
          label='Judges'
          value={judging.judges.toLocaleString()}
          href={`${base}/judging`}
        />
      )}

      {showResults && judging && (
        <StatTile
          icon={<Trophy className='size-4' />}
          label={canViewResults ? 'Judging results' : 'Awards'}
          value={judging.votes.toLocaleString()}
          footnote='votes cast'
          href={`${base}/judging/results/overall`}
        />
      )}
    </TileGrid>
  );
}
