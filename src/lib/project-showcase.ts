import 'server-only';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { cacheLife, cacheTag } from 'next/cache';

import { user as authUser } from '@/db/auth-schema';
import * as schema from '@/db/schema';
import { FEATURED_EVENT_CACHE_TAG } from '@/lib/featured-event';
import * as Judging from '@/lib/judging/server';
import { isUuid } from '@/lib/uuid';
import { db } from '@/utils/db';

export const PROJECT_SHOWCASE_CACHE_TAG = 'project-showcase';

export type ShowcaseProject = {
  id: string;
  title: string;
  /** `/api/assets/submission-content/...`; public, since the project is. */
  coverImageUrl: string | null;
  members: string[];
  repoUrl: string | null;
  demoUrl: string | null;
  videoUrl: string | null;
};

export type PublicProject = ShowcaseProject & { markdown: string };

/** Null until all three podium places are awarded: until then nothing is public. */
export type ProjectShowcase = {
  /** 1st, 2nd, 3rd. */
  podium: [ShowcaseProject, ShowcaseProject, ShowcaseProject];
  /** Every project, the podium included, alphabetical by title. */
  projects: ShowcaseProject[];
} | null;

const byTitle = (a: ShowcaseProject, b: ShowcaseProject) =>
  a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/**
 * The featured event's public projects, for the homepage podium and the
 * `/projects` gallery. Cached until a submission or placement change calls
 * updateTag(PROJECT_SHOWCASE_CACHE_TAG). Published projects aren't edited, so
 * the lifetime is `max`: member renames and account deletions, which don't
 * touch the tag, only show up after a redeploy or the 30-day revalidate.
 */
export async function getProjectShowcase(): Promise<ProjectShowcase> {
  'use cache';
  cacheTag(PROJECT_SHOWCASE_CACHE_TAG, FEATURED_EVENT_CACHE_TAG);
  cacheLife('max');

  const [featured] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.isFeatured, true))
    .limit(1);
  return featured ? loadProjectShowcase(featured.id) : null;
}

const placed = alias(schema.submissions, 'placed');

/**
 * True for a submission whose event has all of 1st, 2nd and 3rd awarded —
 * the point its projects go public. Placements are unique per event and
 * deactivating a project clears its place, so three pool rows in 1–3 is the
 * whole podium.
 */
function resultsPublishedCondition() {
  return sql`(
    SELECT count(*) FROM ${schema.submissions} AS placed
     WHERE ${placed.eventId} = ${schema.submissions.eventId}
       AND ${placed.placement} BETWEEN 1 AND 3
       AND ${placed.published}
       AND ${placed.deactivatedAt} IS NULL
  ) = 3`;
}

const showcaseColumns = {
  id: schema.submissions.id,
  teamId: schema.submissions.teamId,
  title: schema.submissions.title,
  coverImageUrl: schema.submissions.coverImageUrl,
  repoUrl: schema.submissions.repoUrl,
  demoUrl: schema.submissions.demoUrl,
  videoUrl: schema.submissions.videoUrl,
};

type ShowcaseRow = Omit<ShowcaseProject, 'members'> & { teamId: string };

/** Team rosters in join order, keyed by team. */
async function memberNames(teamIds: string[]): Promise<Map<string, string[]>> {
  const byTeam = new Map<string, string[]>();
  if (teamIds.length === 0) return byTeam;
  const rows = await db
    .select({ teamId: schema.teamMembers.teamId, name: authUser.name })
    .from(schema.teamMembers)
    .innerJoin(authUser, eq(authUser.id, schema.teamMembers.userId))
    .where(inArray(schema.teamMembers.teamId, teamIds))
    .orderBy(asc(schema.teamMembers.joinedAt));
  for (const { teamId, name } of rows) {
    byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), name]);
  }
  return byTeam;
}

/**
 * Copies only the public fields, field by field, so a column added to a
 * query (placement, say) can never ride along onto the page.
 */
function toProject(row: ShowcaseRow, members: Map<string, string[]>): ShowcaseProject {
  return {
    id: row.id,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    members: members.get(row.teamId) ?? [],
    repoUrl: row.repoUrl,
    demoUrl: row.demoUrl,
    videoUrl: row.videoUrl,
  };
}

/**
 * An event's showcase: the top three placements, and every published,
 * active project in alphabetical order. Null until the podium is complete.
 *
 * Placement is read only to pick the podium and never leaves this function.
 * The list is sorted by title alone, so nothing about 4th place onwards — or
 * about the podium before it's complete — can be inferred from the page.
 */
async function loadProjectShowcase(eventId: string): Promise<ProjectShowcase> {
  const rows = await db
    .select({ ...showcaseColumns, placement: schema.submissions.placement })
    .from(schema.submissions)
    .where(and(eq(schema.submissions.eventId, eventId), Judging.inPoolCondition()));
  const [first, second, third] = [1, 2, 3].map((place) => rows.find((row) => row.placement === place));
  if (!first || !second || !third) return null;

  const members = await memberNames(rows.map((row) => row.teamId));
  const project = (row: ShowcaseRow) => toProject(row, members);
  return {
    podium: [project(first), project(second), project(third)],
    projects: rows.map(project).sort(byTitle),
  };
}

/**
 * One published, active project with its write-up, for its public page;
 * null for anything else (a draft, a deactivated project, an event whose
 * podium isn't complete, a bad id). Never includes placement.
 */
export async function getPublicProject(projectId: string): Promise<PublicProject | null> {
  'use cache';
  cacheTag(PROJECT_SHOWCASE_CACHE_TAG);
  cacheLife('max');

  if (!isUuid(projectId)) return null;
  const [row] = await db
    .select({ ...showcaseColumns, markdown: schema.submissions.markdown })
    .from(schema.submissions)
    .where(and(eq(schema.submissions.id, projectId), Judging.inPoolCondition(), resultsPublishedCondition()))
    .limit(1);
  if (!row) return null;

  return {
    ...toProject(row, await memberNames([row.teamId])),
    markdown: row.markdown,
  };
}

/**
 * True when `key` (already checked by `isSubmissionAttachmentKey`) belongs to
 * a published, active submission in an event with a complete podium — the
 * projects the showcase lists, whose images anonymous visitors may load.
 * Everything else stays signed-in only.
 */
export async function isPublicSubmissionImage(key: string): Promise<boolean> {
  const submissionId = key.split('/')[1];
  const [row] = await db
    .select({ id: schema.submissions.id })
    .from(schema.submissions)
    .where(and(eq(schema.submissions.id, submissionId), Judging.inPoolCondition(), resultsPublishedCondition()))
    .limit(1);
  return Boolean(row);
}
