import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { and, asc, eq, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import {
  buildProfileStatsByStatus,
  buildQuestionStatsByStatus,
  buildStatusBreakdown,
  type ApplicationStatsRow,
  type StatsBucket,
  type StatusSplitStat,
} from '@/lib/application-stats';
import { EVENT_TIME_ZONE } from '@/lib/datetime';
import * as Participation from '@/lib/participation/server';
import type { ApplicationQuestion } from '@/types/application';
import { db } from '@/utils/db';

/**
 * Read layer for the admin event dashboard.
 *
 * Everything here is a plain cached getter, deliberately *not* a server
 * action: actions are POST endpoints, so they can never be prerendered into
 * the route's App Shell or prefetched. These are what let each bento cell
 * stream from a shared cache entry instead of re-querying per viewer.
 *
 * None of these may read `cookies()`/`headers()` — a plain `use cache` scope
 * can't. Permission checks therefore live in the *calling* cell component,
 * outside the cache boundary, close to the UI they gate.
 */

/** Invalidated wherever an event's own settings, description, or questions change. */
export function adminEventCacheTag(eventId: string): string {
  return `admin-event:${eventId}`;
}

/**
 * Invalidated wherever participation moves: an application submitted or
 * reviewed, a check-in, an RSVP response, a team formed. Separate from the
 * settings tag so reviewing one applicant doesn't drop the event's own row.
 */
export function eventApplicationsCacheTag(eventId: string): string {
  return `event-applications:${eventId}`;
}

export type AdminEventHeader = {
  id: string;
  /** Custom URL segment, or null when the event is addressed by uuid only. */
  slug: string | null;
  name: string;
  descriptionMarkdown: string;
  termsMarkdown: string | null;
  termsId: string | null;
  hasApplication: boolean;
  teamsEnabled: boolean;
  isFeatured: boolean;
  capacity: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  checkInEnabled: boolean;
  location: string | null;
  submissionsCloseAt: Date | null;
};

/**
 * The event's own row — everything the page header and description cell
 * need. Deliberately excludes any count, so editing an event invalidates
 * this without touching the participation numbers (and vice versa).
 *
 * Returns instants, never formatted strings: all zone conversion happens in
 * `LocalDateTime`/`LocalDateRange` on the frontend. See AGENTS.md.
 */
export async function getAdminEventHeader(eventId: string): Promise<AdminEventHeader | null> {
  'use cache';
  cacheTag(adminEventCacheTag(eventId));
  // updateTag() covers the settings/description mutation paths; 'minutes' is
  // both a safety net and the floor that keeps this App Shell-prefetchable.
  cacheLife('minutes');

  const [row] = await db
    .select({
      id: schema.events.id,
      slug: schema.events.slug,
      name: schema.events.name,
      descriptionMarkdown: schema.events.descriptionMarkdown,
      termsMarkdown: schema.eventTerms.markdown,
      termsId: schema.events.termsId,
      hasApplication: schema.events.hasApplication,
      teamsEnabled: schema.events.teamsEnabled,
      isFeatured: schema.events.isFeatured,
      capacity: schema.events.capacity,
      startsAt: schema.events.startsAt,
      endsAt: schema.events.endsAt,
      checkInEnabled: schema.events.checkInEnabled,
      location: schema.events.location,
      submissionsCloseAt: schema.events.submissionsCloseAt,
    })
    .from(schema.events)
    .leftJoin(schema.eventTerms, eq(schema.events.termsId, schema.eventTerms.id))
    .where(eq(schema.events.id, eventId))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    descriptionMarkdown: row.descriptionMarkdown ?? '',
  };
}

/**
 * The event's configured application questions.
 *
 * Its own cache entry rather than a field on `getAdminEventHeader`, because
 * the roster needs it to build one column per question while the header
 * doesn't — keeping them apart means the header entry stays small and a
 * question edit doesn't invalidate the page title.
 */
export async function getEventQuestions(eventId: string): Promise<ApplicationQuestion[]> {
  'use cache';
  cacheTag(adminEventCacheTag(eventId));
  cacheLife('minutes');

  const [row] = await db
    .select({ applicationQuestions: schema.events.applicationQuestions })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);

  return (row?.applicationQuestions as ApplicationQuestion[] | null) ?? [];
}

export type AdminEventSettings = AdminEventHeader & {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  maxTeamSize: number | null;
  rsvpResponseWindowHours: number;
  capacityVisible: boolean;
  eventTypeId: number | null;
};

/**
 * Everything the settings form edits. Separate from `getAdminEventHeader`
 * so the header — which is part of the prerendered shell on every page
 * under this event — doesn't carry geofence and RSVP-window fields that
 * only one form needs.
 */
export async function getAdminEventSettings(eventId: string): Promise<AdminEventSettings | null> {
  'use cache';
  cacheTag(adminEventCacheTag(eventId));
  cacheLife('minutes');

  const [row] = await db
    .select({
      id: schema.events.id,
      slug: schema.events.slug,
      name: schema.events.name,
      descriptionMarkdown: schema.events.descriptionMarkdown,
      termsMarkdown: schema.eventTerms.markdown,
      termsId: schema.events.termsId,
      hasApplication: schema.events.hasApplication,
      teamsEnabled: schema.events.teamsEnabled,
      isFeatured: schema.events.isFeatured,
      capacity: schema.events.capacity,
      startsAt: schema.events.startsAt,
      endsAt: schema.events.endsAt,
      checkInEnabled: schema.events.checkInEnabled,
      location: schema.events.location,
      submissionsCloseAt: schema.events.submissionsCloseAt,
      latitude: schema.events.latitude,
      longitude: schema.events.longitude,
      radiusMeters: schema.events.radiusMeters,
      maxTeamSize: schema.events.maxTeamSize,
      rsvpResponseWindowHours: schema.events.rsvpResponseWindowHours,
      capacityVisible: schema.events.capacityVisible,
      eventTypeId: schema.events.eventTypeId,
    })
    .from(schema.events)
    .leftJoin(schema.eventTerms, eq(schema.events.termsId, schema.eventTerms.id))
    .where(eq(schema.events.id, eventId))
    .limit(1);

  if (!row) return null;

  return { ...row, descriptionMarkdown: row.descriptionMarkdown ?? '' };
}

export type EventSummaryCounts = {
  applications: number;
  attendees: number;
  checkIns: number;
  /** Teams with more than one member, matching what the teams page lists. */
  teams: number;
  rsvp: {
    accepted: number;
    pending: number;
    declined: number;
    timedOut: number;
  };
  submissions: { total: number; published: number };
};

/**
 * The four stat tiles, in one round trip. Each tile is gated on its own
 * permission at the call site, but they're queried together because the
 * whole row is one cache entry shared by every admin viewing this event.
 */
export async function getEventSummaryCounts(eventId: string): Promise<EventSummaryCounts> {
  'use cache';
  cacheTag(eventApplicationsCacheTag(eventId));
  // These move with ordinary participant activity, which no admin mutation
  // tag covers, so 'minutes' is what actually bounds staleness. It also
  // keeps the scope above the 30s floor for prefetching — the check-ins
  // tile therefore lags by up to a minute during an event, which is the
  // right trade for an overview. /checkin stays live via its own polling.
  cacheLife('minutes');

  const countOf = sql<number>`COUNT(*)`.mapWith(Number);

  const [applicationRows, attendeeRows, checkInRows, teamRows, rsvpRows, submissionRows] = await Promise.all([
    db.select({ c: countOf }).from(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventId)),
    db
      .select({ c: countOf })
      .from(schema.eventParticipants)
      .where(and(eq(schema.eventParticipants.eventId, eventId), Participation.attending())),
    db.select({ c: countOf }).from(schema.checkIns).where(eq(schema.checkIns.eventId, eventId)),
    // Solo teams-of-one are excluded here for the same reason
    // `listFormedTeams` excludes them — an unjoined code isn't a team.
    db
      .select({
        c: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(
        db
          .select({ teamId: schema.teamMembers.teamId })
          .from(schema.teamMembers)
          .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
          .where(eq(schema.teams.eventId, eventId))
          .groupBy(schema.teamMembers.teamId)
          .having(sql`COUNT(*) > 1`)
          .as('formed_teams'),
      ),
    db
      .select({
        label: schema.participationStatuses.label,
        respondBy: schema.eventRsvpWaves.respondBy,
        c: countOf,
      })
      .from(schema.eventInvitations)
      .innerJoin(schema.eventRsvpWaves, eq(schema.eventRsvpWaves.id, schema.eventInvitations.rsvpWaveId))
      .innerJoin(schema.eventParticipants, eq(schema.eventParticipants.id, schema.eventInvitations.participantId))
      .innerJoin(schema.participationStatuses, eq(schema.participationStatuses.id, schema.eventParticipants.statusId))
      .where(eq(schema.eventRsvpWaves.eventId, eventId))
      .groupBy(schema.participationStatuses.label, schema.eventRsvpWaves.respondBy),
    db
      .select({
        total: countOf,
        published: sql<number>`COUNT(*) FILTER (WHERE ${schema.submissions.published})`.mapWith(Number),
      })
      .from(schema.submissions)
      .where(eq(schema.submissions.eventId, eventId)),
  ]);

  const rsvp = { accepted: 0, pending: 0, declined: 0, timedOut: 0 };
  const now = new Date();
  for (const row of rsvpRows) {
    const status = Participation.resolveEffectiveStatus(row.label, row.respondBy, now);
    if (status === 'accepted') rsvp.accepted += row.c;
    else if (status === 'declined') rsvp.declined += row.c;
    else if (status === 'timed_out') rsvp.timedOut += row.c;
    else rsvp.pending += row.c;
  }

  return {
    applications: applicationRows[0]?.c ?? 0,
    attendees: attendeeRows[0]?.c ?? 0,
    checkIns: checkInRows[0]?.c ?? 0,
    teams: teamRows[0]?.c ?? 0,
    rsvp,
    submissions: {
      total: submissionRows[0]?.total ?? 0,
      published: submissionRows[0]?.published ?? 0,
    },
  };
}

export type EventApplicationStats = {
  hasApplication: boolean;
  total: number;
  /** Per-question breakdowns, split by participation status. */
  questionStats: StatusSplitStat[];
  /** Per-profile-field breakdowns, split by participation status. */
  profileStats: StatusSplitStat[];
  statusBreakdown: StatsBucket[];
};

/**
 * Cohort-level application statistics: the status list and the per-question
 * and per-profile-field breakdowns, built from one pass over the
 * applications.
 *
 * Both the "Applications overview" and "Stats" cells call this. They're separate Suspense boundaries but share this one
 * cache entry, so the second is a hit rather than a second scan.
 *
 * Aggregation happens here, on the server: raw per-applicant `responses`
 * never leave this function. That's the privacy boundary which makes
 * `application:stats` a weaker permission than `application:read:all` — the
 * former only ever yields cohort numbers, the latter yields individuals.
 */
export async function getEventApplicationStats(eventId: string): Promise<EventApplicationStats | null> {
  'use cache';
  cacheTag(adminEventCacheTag(eventId));
  cacheTag(eventApplicationsCacheTag(eventId));
  cacheLife('minutes');

  const [eventRow] = await db
    .select({
      applicationQuestions: schema.events.applicationQuestions,
      hasApplication: schema.events.hasApplication,
    })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);

  if (!eventRow) return null;

  const questions = (eventRow.applicationQuestions as ApplicationQuestion[] | null) ?? [];

  const rows = await db
    .select({
      responses: schema.eventParticipants.responses,
      status: schema.participationStatuses.label,
      university: schema.universities.label,
      major: schema.majors.label,
      yearOfStudy: schema.yearsOfStudy.label,
      gender: schema.genders.label,
      hasProfile: sql<boolean>`${schema.userProfiles.userId} IS NOT NULL`,
      attendedHackathonBefore: schema.userProfileAbout.attendedHackathonBefore,
      // Correlated subqueries rather than joins: two many-to-many joins on
      // one query would multiply each applicant's row by both list lengths.
      interests: sql<string[]>`ARRAY(
        SELECT ${schema.interests.label}::text FROM ${schema.userInterests}
        INNER JOIN ${schema.interests} ON ${schema.interests.id} = ${schema.userInterests.interestId}
        WHERE ${schema.userInterests.userId} = ${schema.eventParticipants.userId}
      )`,
      dietaryRestrictions: sql<string[]>`ARRAY(
        SELECT ${schema.dietaryRestrictions.label}::text FROM ${schema.userDietaryRestrictions}
        INNER JOIN ${schema.dietaryRestrictions} ON ${schema.dietaryRestrictions.id} = ${schema.userDietaryRestrictions.restrictionId}
        WHERE ${schema.userDietaryRestrictions.userId} = ${schema.eventParticipants.userId}
      )`,
    })
    .from(schema.eventParticipants)
    .leftJoin(schema.userProfiles, eq(schema.eventParticipants.userId, schema.userProfiles.userId))
    .leftJoin(schema.userProfileAbout, eq(schema.eventParticipants.userId, schema.userProfileAbout.userId))
    .leftJoin(schema.genders, eq(schema.userProfiles.genderId, schema.genders.id))
    .leftJoin(schema.universities, eq(schema.userProfileAbout.universityId, schema.universities.id))
    .leftJoin(schema.majors, eq(schema.userProfileAbout.majorId, schema.majors.id))
    .leftJoin(schema.yearsOfStudy, eq(schema.userProfileAbout.yearOfStudyId, schema.yearsOfStudy.id))
    .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
    .where(eq(schema.eventParticipants.eventId, eventId));

  const statsRows: ApplicationStatsRow[] = rows.map((row) => ({
    responses: (row.responses as Record<string, unknown> | null) ?? null,
    status: row.status ?? null,
    university: row.university ?? null,
    major: row.major ?? null,
    yearOfStudy: row.yearOfStudy ?? null,
    gender: row.gender ?? null,
    attendedHackathonBefore: row.attendedHackathonBefore ?? null,
    // Interests and dietary restrictions live with the profile, so with no
    // profile row an empty list means "unknown", not "picked none".
    interests: row.hasProfile ? row.interests : null,
    dietaryRestrictions: row.hasProfile ? row.dietaryRestrictions : null,
  }));

  return {
    hasApplication: eventRow.hasApplication,
    total: statsRows.length,
    questionStats: buildQuestionStatsByStatus(questions, statsRows),
    profileStats: buildProfileStatsByStatus(statsRows),
    statusBreakdown: buildStatusBreakdown(statsRows),
  };
}

export type ApplicationsOverTimePoint = {
  /** Instant at the start of that day in `EVENT_TIME_ZONE`. */
  day: Date;
  count: number;
  cumulative: number;
};

/**
 * Daily application counts, cumulated — the "Applications over time" chart.
 *
 * Days are bucketed in `EVENT_TIME_ZONE` rather than UTC, so a submission at
 * 6pm local lands on the day the organizer would call it, then converted
 * back to a real instant so the value crossing the wire is still a UTC
 * instant the frontend localizes. Bucketing in the server's own zone (what
 * a bare `date_trunc` does) would move boundaries with the deploy target.
 */
export async function getApplicationsOverTime(eventId: string): Promise<ApplicationsOverTimePoint[]> {
  'use cache';
  cacheTag(eventApplicationsCacheTag(eventId));
  cacheLife('minutes');

  // Inlined rather than bound: Postgres can't resolve `AT TIME ZONE` against
  // an untyped bind parameter (it fails to determine the operator's argument
  // type at parse time). `EVENT_TIME_ZONE` is a module constant, never user
  // input, so there's nothing to inject here.
  const zone = sql.raw(`'${EVENT_TIME_ZONE}'`);
  const dayExpr = sql`date_trunc('day', ${schema.eventParticipants.createdAt} AT TIME ZONE ${zone}) AT TIME ZONE ${zone}`;

  const rows = await db
    .select({
      day: sql<Date>`${dayExpr}`.mapWith(schema.eventParticipants.createdAt),
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(schema.eventParticipants)
    .where(eq(schema.eventParticipants.eventId, eventId))
    .groupBy(dayExpr)
    .orderBy(asc(dayExpr));

  let cumulative = 0;
  return rows.map((row) => {
    cumulative += row.count;
    return { day: row.day, count: row.count, cumulative };
  });
}

export type AdminApplicationRow = {
  participantId: string;
  userId: string;
  fullName: string;
  email: string;
  university: string | null;
  major: string | null;
  yearOfStudy: string | null;
  submittedAt: Date;
  /**
   * The applicant's team join code, or null. Teams have no name in the
   * schema — they're identified by code and organizer — so the roster shows
   * the code rather than inventing a label.
   */
  teamCode: string | null;
  /** Whether a resume is on file — the object key itself never leaves here. */
  hasResume: boolean;
  responses: Record<string, unknown>;
};

/**
 * Every application for an event, with the applicant's identity and full
 * answers — the "All applications" table.
 *
 * This is individual-level data, so its only legitimate caller is a cell
 * gated on `application:read:all`. Keep it out of anything that only holds
 * `application:stats`.
 *
 * Status is deliberately not here: it changes without touching this cache
 * (an RSVP wave from cron, a deadline passing), so callers read it fresh
 * through `getParticipantStatuses`.
 */
export async function getApplicationRoster(eventId: string): Promise<AdminApplicationRow[]> {
  'use cache';
  cacheTag(eventApplicationsCacheTag(eventId));
  cacheLife('minutes');

  const rows = await db
    .select({
      participantId: schema.eventParticipants.id,
      userId: schema.eventParticipants.userId,
      fullName: schema.userProfiles.fullName,
      email: schema.user.email,
      university: schema.universities.label,
      major: schema.majors.label,
      yearOfStudy: schema.yearsOfStudy.label,
      submittedAt: schema.eventParticipants.createdAt,
      teamCode: schema.teams.code,
      resumeFile: schema.userProfiles.resumeFile,
      responses: schema.eventParticipants.responses,
    })
    .from(schema.eventParticipants)
    .innerJoin(schema.user, eq(schema.eventParticipants.userId, schema.user.id))
    .leftJoin(schema.userProfiles, eq(schema.eventParticipants.userId, schema.userProfiles.userId))
    .leftJoin(schema.userProfileAbout, eq(schema.eventParticipants.userId, schema.userProfileAbout.userId))
    .leftJoin(schema.universities, eq(schema.userProfileAbout.universityId, schema.universities.id))
    .leftJoin(schema.majors, eq(schema.userProfileAbout.majorId, schema.majors.id))
    .leftJoin(schema.yearsOfStudy, eq(schema.userProfileAbout.yearOfStudyId, schema.yearsOfStudy.id))
    .leftJoin(
      schema.teamMembers,
      sql`${schema.teamMembers.userId} = ${schema.eventParticipants.userId} AND ${schema.teamMembers.eventId} = ${schema.eventParticipants.eventId}`,
    )
    .leftJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(eq(schema.eventParticipants.eventId, eventId))
    .orderBy(asc(schema.eventParticipants.createdAt));

  return rows.map((row) => ({
    participantId: row.participantId,
    userId: row.userId,
    fullName: row.fullName || 'Unknown',
    email: row.email,
    university: row.university ?? null,
    major: row.major ?? null,
    yearOfStudy: row.yearOfStudy ?? null,
    submittedAt: row.submittedAt,
    teamCode: row.teamCode ?? null,
    hasResume: Boolean(row.resumeFile),
    responses: (row.responses as Record<string, unknown> | null) ?? {},
  }));
}

export type AdminAttendeeRow = {
  userId: string;
  fullName: string;
  email: string;
  registeredAt: Date;
};

/**
 * Registered attendees for an event with no application form — the simple
 * signup path. The dashboard's roster cell shows these instead of
 * applications when `hasApplication` is false.
 */
export async function getEventAttendeeRoster(eventId: string): Promise<AdminAttendeeRow[]> {
  'use cache';
  cacheTag(eventApplicationsCacheTag(eventId));
  cacheLife('minutes');

  const rows = await db
    .select({
      userId: schema.eventParticipants.userId,
      fullName: schema.userProfiles.fullName,
      email: schema.user.email,
      registeredAt: schema.eventParticipants.createdAt,
    })
    .from(schema.eventParticipants)
    .innerJoin(schema.user, eq(schema.eventParticipants.userId, schema.user.id))
    .leftJoin(schema.userProfiles, eq(schema.eventParticipants.userId, schema.userProfiles.userId))
    .where(and(eq(schema.eventParticipants.eventId, eventId), Participation.attending()))
    .orderBy(asc(schema.eventParticipants.createdAt));

  return rows.map((row) => ({
    userId: row.userId,
    fullName: row.fullName || 'Unknown',
    email: row.email,
    registeredAt: row.registeredAt,
  }));
}

export type ParticipantStatusRow = {
  participantId: string;
  statusLabel: string;
  respondBy: Date | null;
  checkedIn: boolean;
};

/**
 * Every participant's stored status, invitation deadline and door check-in
 * for an event — uncached, so the roster always shows the live status next
 * to the cached `getApplicationRoster` details. Resolve with
 * `resolveEffectiveStatus` / `deriveAttendance`.
 */
export async function getParticipantStatuses(eventId: string): Promise<ParticipantStatusRow[]> {
  return db
    .select({
      participantId: schema.eventParticipants.id,
      statusLabel: schema.participationStatuses.label,
      respondBy: schema.eventRsvpWaves.respondBy,
      checkedIn: sql<boolean>`${schema.checkIns.userId} IS NOT NULL`,
    })
    .from(schema.eventParticipants)
    .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
    .leftJoin(schema.eventInvitations, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
    .leftJoin(schema.eventRsvpWaves, eq(schema.eventInvitations.rsvpWaveId, schema.eventRsvpWaves.id))
    .leftJoin(
      schema.checkIns,
      and(
        eq(schema.checkIns.eventId, schema.eventParticipants.eventId),
        eq(schema.checkIns.userId, schema.eventParticipants.userId),
      ),
    )
    .where(eq(schema.eventParticipants.eventId, eventId));
}
