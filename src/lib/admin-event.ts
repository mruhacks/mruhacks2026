import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { asc, eq, sql } from 'drizzle-orm';

import {
  applicationStatuses,
  checkIns,
  eventApplications,
  eventAttendees,
  eventRsvpResponses,
  eventRsvpWaves,
  events,
  genders,
  majors,
  rsvpStatuses,
  teamMembers,
  teams,
  universities,
  user,
  userProfileAbout,
  userProfiles,
  yearsOfStudy,
} from '@/db/schema';
import {
  buildQuestionStats,
  buildStatusBreakdown,
  type ApplicationStatsRow,
  type QuestionStats,
  type StatsBucket,
} from '@/lib/application-stats';
import { EVENT_TIME_ZONE } from '@/lib/datetime';
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
  name: string;
  descriptionMarkdown: string;
  hasApplication: boolean;
  teamsEnabled: boolean;
  isFeatured: boolean;
  capacity: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
};

/**
 * The event's own row — everything the page header and description cell
 * need. Deliberately excludes any count, so editing an event invalidates
 * this without touching the participation numbers (and vice versa).
 *
 * Returns instants, never formatted strings: all zone conversion happens in
 * `LocalDateTime`/`LocalDateRange` on the frontend. See AGENTS.md.
 */
export async function getAdminEventHeader(
  eventId: string,
): Promise<AdminEventHeader | null> {
  'use cache';
  cacheTag(adminEventCacheTag(eventId));
  // updateTag() covers the settings/description mutation paths; 'minutes' is
  // both a safety net and the floor that keeps this App Shell-prefetchable.
  cacheLife('minutes');

  const [row] = await db
    .select({
      id: events.id,
      name: events.name,
      descriptionMarkdown: events.descriptionMarkdown,
      hasApplication: events.hasApplication,
      teamsEnabled: events.teamsEnabled,
      isFeatured: events.isFeatured,
      capacity: events.capacity,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      location: events.location,
    })
    .from(events)
    .where(eq(events.id, eventId))
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
export async function getEventQuestions(
  eventId: string,
): Promise<ApplicationQuestion[]> {
  'use cache';
  cacheTag(adminEventCacheTag(eventId));
  cacheLife('minutes');

  const [row] = await db
    .select({ applicationQuestions: events.applicationQuestions })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  return (row?.applicationQuestions as ApplicationQuestion[] | null) ?? [];
}

export type AdminEventSettings = AdminEventHeader & {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  maxTeamSize: number | null;
  rsvpResponseWindowHours: number;
};

/**
 * Everything the settings form edits. Separate from `getAdminEventHeader`
 * so the header — which is part of the prerendered shell on every page
 * under this event — doesn't carry geofence and RSVP-window fields that
 * only one form needs.
 */
export async function getAdminEventSettings(
  eventId: string,
): Promise<AdminEventSettings | null> {
  'use cache';
  cacheTag(adminEventCacheTag(eventId));
  cacheLife('minutes');

  const [row] = await db
    .select({
      id: events.id,
      name: events.name,
      descriptionMarkdown: events.descriptionMarkdown,
      hasApplication: events.hasApplication,
      teamsEnabled: events.teamsEnabled,
      isFeatured: events.isFeatured,
      capacity: events.capacity,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      location: events.location,
      latitude: events.latitude,
      longitude: events.longitude,
      radiusMeters: events.radiusMeters,
      maxTeamSize: events.maxTeamSize,
      rsvpResponseWindowHours: events.rsvpResponseWindowHours,
    })
    .from(events)
    .where(eq(events.id, eventId))
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
};

/**
 * The four stat tiles, in one round trip. Each tile is gated on its own
 * permission at the call site, but they're queried together because the
 * whole row is one cache entry shared by every admin viewing this event.
 */
export async function getEventSummaryCounts(
  eventId: string,
): Promise<EventSummaryCounts> {
  'use cache';
  cacheTag(eventApplicationsCacheTag(eventId));
  // These move with ordinary participant activity, which no admin mutation
  // tag covers, so 'minutes' is what actually bounds staleness. It also
  // keeps the scope above the 30s floor for prefetching — the check-ins
  // tile therefore lags by up to a minute during an event, which is the
  // right trade for an overview. /checkin stays live via its own polling.
  cacheLife('minutes');

  const countOf = sql<number>`COUNT(*)`.mapWith(Number);

  const [applicationRows, attendeeRows, checkInRows, teamRows, rsvpRows] =
    await Promise.all([
      db
        .select({ c: countOf })
        .from(eventApplications)
        .where(eq(eventApplications.eventId, eventId)),
      db
        .select({ c: countOf })
        .from(eventAttendees)
        .where(eq(eventAttendees.eventId, eventId)),
      db
        .select({ c: countOf })
        .from(checkIns)
        .where(eq(checkIns.eventId, eventId)),
      // Solo teams-of-one are excluded here for the same reason
      // `listFormedTeams` excludes them — an unjoined code isn't a team.
      db
        .select({
          c: sql<number>`COUNT(*)`.mapWith(Number),
        })
        .from(
          db
            .select({ teamId: teamMembers.teamId })
            .from(teamMembers)
            .innerJoin(teams, eq(teams.id, teamMembers.teamId))
            .where(eq(teams.eventId, eventId))
            .groupBy(teamMembers.teamId)
            .having(sql`COUNT(*) > 1`)
            .as('formed_teams'),
        ),
      db
        .select({
          label: rsvpStatuses.label,
          c: countOf,
        })
        .from(eventRsvpResponses)
        .innerJoin(
          eventRsvpWaves,
          eq(eventRsvpWaves.id, eventRsvpResponses.rsvpWaveId),
        )
        .leftJoin(
          rsvpStatuses,
          eq(rsvpStatuses.id, eventRsvpResponses.statusId),
        )
        .where(eq(eventRsvpWaves.eventId, eventId))
        .groupBy(rsvpStatuses.label),
    ]);

  const rsvp = { accepted: 0, pending: 0, declined: 0, timedOut: 0 };
  for (const row of rsvpRows) {
    if (row.label === 'accepted') rsvp.accepted = row.c;
    else if (row.label === 'declined') rsvp.declined = row.c;
    else if (row.label === 'timed_out') rsvp.timedOut = row.c;
    // A response with no status row yet is still awaiting an answer.
    else rsvp.pending += row.c;
  }

  return {
    applications: applicationRows[0]?.c ?? 0,
    attendees: attendeeRows[0]?.c ?? 0,
    checkIns: checkInRows[0]?.c ?? 0,
    teams: teamRows[0]?.c ?? 0,
    rsvp,
  };
}

export type EventApplicationStats = {
  hasApplication: boolean;
  total: number;
  questionStats: QuestionStats[];
  statusBreakdown: StatsBucket[];
};

/**
 * Cohort-level application statistics: the status list and the per-question
 * breakdown, built from one pass over the applications.
 *
 * Both the "Applications overview" and "Application question breakdown"
 * cells call this. They're separate Suspense boundaries but share this one
 * cache entry, so the second is a hit rather than a second scan.
 *
 * Aggregation happens here, on the server: raw per-applicant `responses`
 * never leave this function. That's the privacy boundary which makes
 * `application:stats` a weaker permission than `application:read:all` — the
 * former only ever yields cohort numbers, the latter yields individuals.
 */
export async function getEventApplicationStats(
  eventId: string,
): Promise<EventApplicationStats | null> {
  'use cache';
  cacheTag(adminEventCacheTag(eventId));
  cacheTag(eventApplicationsCacheTag(eventId));
  cacheLife('minutes');

  const [eventRow] = await db
    .select({
      applicationQuestions: events.applicationQuestions,
      hasApplication: events.hasApplication,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRow) return null;

  const questions =
    (eventRow.applicationQuestions as ApplicationQuestion[] | null) ?? [];

  const rows = await db
    .select({
      responses: eventApplications.responses,
      status: applicationStatuses.label,
      university: universities.label,
      major: majors.label,
      yearOfStudy: yearsOfStudy.label,
      gender: genders.label,
    })
    .from(eventApplications)
    .leftJoin(userProfiles, eq(eventApplications.userId, userProfiles.userId))
    .leftJoin(
      userProfileAbout,
      eq(eventApplications.userId, userProfileAbout.userId),
    )
    .leftJoin(genders, eq(userProfiles.genderId, genders.id))
    .leftJoin(universities, eq(userProfileAbout.universityId, universities.id))
    .leftJoin(majors, eq(userProfileAbout.majorId, majors.id))
    .leftJoin(yearsOfStudy, eq(userProfileAbout.yearOfStudyId, yearsOfStudy.id))
    .leftJoin(
      applicationStatuses,
      eq(eventApplications.statusId, applicationStatuses.id),
    )
    .where(eq(eventApplications.eventId, eventId));

  const statsRows: ApplicationStatsRow[] = rows.map((row) => ({
    responses: (row.responses as Record<string, unknown> | null) ?? null,
    status: row.status ?? null,
    university: row.university ?? null,
    major: row.major ?? null,
    yearOfStudy: row.yearOfStudy ?? null,
    gender: row.gender ?? null,
  }));

  return {
    hasApplication: eventRow.hasApplication,
    total: statsRows.length,
    questionStats: buildQuestionStats(questions, statsRows),
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
export async function getApplicationsOverTime(
  eventId: string,
): Promise<ApplicationsOverTimePoint[]> {
  'use cache';
  cacheTag(eventApplicationsCacheTag(eventId));
  cacheLife('minutes');

  // Inlined rather than bound: Postgres can't resolve `AT TIME ZONE` against
  // an untyped bind parameter (it fails to determine the operator's argument
  // type at parse time). `EVENT_TIME_ZONE` is a module constant, never user
  // input, so there's nothing to inject here.
  const zone = sql.raw(`'${EVENT_TIME_ZONE}'`);
  const dayExpr = sql`date_trunc('day', ${eventApplications.createdAt} AT TIME ZONE ${zone}) AT TIME ZONE ${zone}`;

  const rows = await db
    .select({
      day: sql<Date>`${dayExpr}`.mapWith(eventApplications.createdAt),
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(eventApplications)
    .where(eq(eventApplications.eventId, eventId))
    .groupBy(dayExpr)
    .orderBy(asc(dayExpr));

  let cumulative = 0;
  return rows.map((row) => {
    cumulative += row.count;
    return { day: row.day, count: row.count, cumulative };
  });
}

export type AdminApplicationRow = {
  applicationId: string;
  userId: string;
  fullName: string;
  email: string;
  university: string | null;
  major: string | null;
  yearOfStudy: string | null;
  status: string | null;
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
 */
export async function getApplicationRoster(
  eventId: string,
): Promise<AdminApplicationRow[]> {
  'use cache';
  cacheTag(eventApplicationsCacheTag(eventId));
  cacheLife('minutes');

  const rows = await db
    .select({
      applicationId: eventApplications.id,
      userId: eventApplications.userId,
      fullName: userProfiles.fullName,
      email: user.email,
      university: universities.label,
      major: majors.label,
      yearOfStudy: yearsOfStudy.label,
      status: applicationStatuses.label,
      submittedAt: eventApplications.createdAt,
      teamCode: teams.code,
      resumeFile: userProfiles.resumeFile,
      responses: eventApplications.responses,
    })
    .from(eventApplications)
    .innerJoin(user, eq(eventApplications.userId, user.id))
    .leftJoin(userProfiles, eq(eventApplications.userId, userProfiles.userId))
    .leftJoin(
      userProfileAbout,
      eq(eventApplications.userId, userProfileAbout.userId),
    )
    .leftJoin(universities, eq(userProfileAbout.universityId, universities.id))
    .leftJoin(majors, eq(userProfileAbout.majorId, majors.id))
    .leftJoin(yearsOfStudy, eq(userProfileAbout.yearOfStudyId, yearsOfStudy.id))
    .leftJoin(
      applicationStatuses,
      eq(eventApplications.statusId, applicationStatuses.id),
    )
    .leftJoin(
      teamMembers,
      sql`${teamMembers.userId} = ${eventApplications.userId} AND ${teamMembers.eventId} = ${eventApplications.eventId}`,
    )
    .leftJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(eventApplications.eventId, eventId))
    .orderBy(asc(eventApplications.createdAt));

  return rows.map((row) => ({
    applicationId: row.applicationId,
    userId: row.userId,
    fullName: row.fullName || 'Unknown',
    email: row.email,
    university: row.university ?? null,
    major: row.major ?? null,
    yearOfStudy: row.yearOfStudy ?? null,
    status: row.status ?? null,
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
export async function getEventAttendeeRoster(
  eventId: string,
): Promise<AdminAttendeeRow[]> {
  'use cache';
  cacheTag(eventApplicationsCacheTag(eventId));
  cacheLife('minutes');

  const rows = await db
    .select({
      userId: eventAttendees.userId,
      fullName: userProfiles.fullName,
      email: user.email,
      registeredAt: eventAttendees.registeredAt,
    })
    .from(eventAttendees)
    .innerJoin(user, eq(eventAttendees.userId, user.id))
    .leftJoin(userProfiles, eq(eventAttendees.userId, userProfiles.userId))
    .where(eq(eventAttendees.eventId, eventId))
    .orderBy(asc(eventAttendees.registeredAt));

  return rows.map((row) => ({
    userId: row.userId,
    fullName: row.fullName || 'Unknown',
    email: row.email,
    registeredAt: row.registeredAt,
  }));
}
