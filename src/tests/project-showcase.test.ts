/**
 * Tests for the homepage project showcase: src/lib/project-showcase.ts.
 * The podium shows 1st–3rd; everything else must come back alphabetically,
 * never in placement order — and published projects' images are public.
 */
import { afterAll, describe, expect, test, vi } from 'vitest';
import { inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';

vi.mock('next/cache', () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { getPublicProject, isPublicSubmissionImage, loadProjectShowcase } from '@/lib/project-showcase';
import { submissionAttachmentPrefix } from '@/utils/object-storage';

const created: { users: string[]; events: string[] } = {
  users: [],
  events: [],
};
let counter = 0;

afterAll(async () => {
  if (created.events.length > 0) {
    await db.delete(schema.events).where(inArray(schema.events.id, created.events));
  }
  if (created.users.length > 0) {
    await db.delete(schema.user).where(inArray(schema.user.id, created.users));
  }
});

async function makeEvent(): Promise<string> {
  const [e] = await db
    .insert(schema.events)
    .values({ name: 'Showcase Test Event', hasApplication: true })
    .returning({ id: schema.events.id });
  created.events.push(e.id);
  return e.id;
}

async function makeProject(
  eventId: string,
  title: string,
  {
    placement = null,
    published = true,
    deactivated = false,
    members = [],
  }: {
    placement?: number | null;
    published?: boolean;
    deactivated?: boolean;
    members?: string[];
  } = {},
): Promise<string> {
  const [team] = await db
    .insert(schema.teams)
    .values({ eventId, code: `S${String(counter++).padStart(7, '0')}` })
    .returning({ id: schema.teams.id });
  for (const name of members) {
    const [u] = await db
      .insert(schema.user)
      .values({
        name,
        email: `showcase-test-${counter++}-${Date.now()}@example.com`,
        emailVerified: true,
      })
      .returning({ id: schema.user.id });
    created.users.push(u.id);
    await db.insert(schema.teamMembers).values({ teamId: team.id, userId: u.id, eventId });
  }
  const [s] = await db
    .insert(schema.submissions)
    .values({
      eventId,
      teamId: team.id,
      title,
      published,
      publishedAt: published ? new Date() : null,
      deactivatedAt: deactivated ? new Date() : null,
      placement,
    })
    .returning({ id: schema.submissions.id });
  return s.id;
}

describe('loadProjectShowcase', () => {
  test('podium in place order; the full list alphabetical, not by placement', async () => {
    const eventId = await makeEvent();
    const first = await makeProject(eventId, 'Gamma', {
      placement: 1,
      members: ['Ada', 'Grace'],
    });
    const second = await makeProject(eventId, 'Alpha', { placement: 2 });
    const third = await makeProject(eventId, 'Zeta', { placement: 3 });
    // Placed 4th–6th in the reverse of alphabetical order.
    await makeProject(eventId, 'delta', { placement: 4 });
    await makeProject(eventId, 'Charlie', { placement: 5 });
    await makeProject(eventId, 'Bravo', { placement: 6 });
    await makeProject(eventId, 'Echo');

    const showcase = await loadProjectShowcase(eventId);

    expect(showcase.podium?.map((p) => p.id)).toEqual([first, second, third]);
    expect(showcase.podium?.[0].members).toEqual(['Ada', 'Grace']);
    expect(showcase.projects.map((p) => p.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'delta',
      'Echo',
      'Gamma',
      'Zeta',
    ]);
    for (const project of [...showcase.podium!, ...showcase.projects]) {
      expect(project).not.toHaveProperty('placement');
      expect(project).not.toHaveProperty('teamId');
    }
  });

  test('no podium until all three places are awarded', async () => {
    const eventId = await makeEvent();
    await makeProject(eventId, 'Beta', { placement: 1 });
    await makeProject(eventId, 'Alpha', { placement: 2 });
    await makeProject(eventId, 'Gamma');

    const showcase = await loadProjectShowcase(eventId);

    expect(showcase.podium).toBeNull();
    expect(showcase.projects.map((p) => p.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  test('leaves out drafts and deactivated projects', async () => {
    const eventId = await makeEvent();
    await makeProject(eventId, 'Draft', { published: false });
    await makeProject(eventId, 'Disqualified', { deactivated: true });
    await makeProject(eventId, 'Shipped');

    const showcase = await loadProjectShowcase(eventId);

    expect(showcase.projects.map((p) => p.title)).toEqual(['Shipped']);
  });
});

describe('isPublicSubmissionImage', () => {
  const imageKey = (submissionId: string) => `${submissionAttachmentPrefix(submissionId)}${crypto.randomUUID()}.png`;

  test('only for published, active projects', async () => {
    const eventId = await makeEvent();
    const shipped = await makeProject(eventId, 'Shipped');
    const draft = await makeProject(eventId, 'Draft', { published: false });
    const disqualified = await makeProject(eventId, 'Disqualified', {
      deactivated: true,
    });

    expect(await isPublicSubmissionImage(imageKey(shipped))).toBe(true);
    expect(await isPublicSubmissionImage(imageKey(draft))).toBe(false);
    expect(await isPublicSubmissionImage(imageKey(disqualified))).toBe(false);
    expect(await isPublicSubmissionImage(imageKey(crypto.randomUUID()))).toBe(false);
  });
});

describe('getPublicProject', () => {
  test('a published, active project, without its placement', async () => {
    const eventId = await makeEvent();
    const shipped = await makeProject(eventId, 'Shipped', {
      placement: 7,
      members: ['Ada'],
    });
    const draft = await makeProject(eventId, 'Draft', { published: false });
    const disqualified = await makeProject(eventId, 'Disqualified', {
      deactivated: true,
    });

    const project = await getPublicProject(shipped);
    expect(project).toMatchObject({
      id: shipped,
      title: 'Shipped',
      members: ['Ada'],
      markdown: '',
    });
    expect(project).not.toHaveProperty('placement');
    expect(project).not.toHaveProperty('teamId');

    expect(await getPublicProject(draft)).toBeNull();
    expect(await getPublicProject(disqualified)).toBeNull();
    expect(await getPublicProject('not-a-uuid')).toBeNull();
  });
});
