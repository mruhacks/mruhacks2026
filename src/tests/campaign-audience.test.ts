import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import * as Campaigns from '@/lib/campaigns/server';
import { insertAttendees, insertInvitation, insertParticipant } from '@/tests/participation-fixtures';

/**
 * Cast of characters (all verified unless noted):
 *   accepted1   — E1 accepted, opted in, checked in to E1, on a team in E1, has role R
 *   both        — E1 accepted and E2 accepted, opted in
 *   waitlisted  — E1 waitlisted, explicitly opted out
 *   expired     — E1 invited with a deadline in the past (effective timed_out), opted in
 *   outsider    — no participation, opted in, checked in to sub-event S of E1
 *   unverified  — E1 accepted, opted in, email NOT verified
 */
const ids: Record<string, string> = {};
let e1: string;
let e2: string;
let sub: string;
let roleId: number;

const MARKETING: Campaigns.AudienceContext = { type: 'marketing', eventId: null };

function group(
  rules: Campaigns.AudienceRuleGroup['rules'],
  extra: Partial<Campaigns.AudienceRuleGroup> = {},
): Campaigns.AudienceRuleGroup {
  return Campaigns.audienceRulesSchema.parse({ combinator: 'and', rules, ...extra });
}

/** Names of the cast members an audience resolves to (other test files' users are ignored). */
async function who(
  tree: Campaigns.AudienceRuleGroup,
  context: Campaigns.AudienceContext = MARKETING,
): Promise<string[]> {
  const byId = new Map(Object.entries(ids).map(([name, id]) => [id, name]));
  const members = await Campaigns.resolveAudience(tree, context);
  return members
    .map((m) => byId.get(m.id))
    .filter((name): name is string => Boolean(name))
    .sort();
}

beforeAll(async () => {
  const names = ['accepted1', 'both', 'waitlisted', 'expired', 'outsider', 'unverified'];
  for (const name of names) {
    const [row] = await db
      .insert(schema.user)
      .values({
        name: `Audience ${name}`,
        email: `audience-${name}@example.com`,
        emailVerified: name !== 'unverified',
      })
      .returning({ id: schema.user.id });
    ids[name] = row.id;
  }

  const [ev1] = await db
    .insert(schema.events)
    .values({ name: 'Audience E1', hasApplication: true, teamsEnabled: true })
    .returning({ id: schema.events.id });
  const [ev2] = await db.insert(schema.events).values({ name: 'Audience E2' }).returning({ id: schema.events.id });
  const [subEvent] = await db
    .insert(schema.events)
    .values({ name: 'Audience S (lunch)', parentEventId: ev1.id })
    .returning({ id: schema.events.id });
  e1 = ev1.id;
  e2 = ev2.id;
  sub = subEvent.id;

  await insertAttendees([
    { eventId: e1, userId: ids.accepted1 },
    { eventId: e1, userId: ids.both },
    { eventId: e2, userId: ids.both },
    { eventId: e1, userId: ids.unverified },
  ]);
  await insertParticipant({
    eventId: e1,
    userId: ids.waitlisted,
    status: 'waitlisted',
  });
  const [wave] = await db
    .insert(schema.eventRsvpWaves)
    .values({
      eventId: e1,
      wave: 1,
      respondBy: new Date(Date.now() - 60 * 60 * 1000),
    })
    .returning({ id: schema.eventRsvpWaves.id });
  await insertInvitation({
    rsvpWaveId: wave.id,
    eventId: e1,
    userId: ids.expired,
    status: 'invited',
  });

  await db.insert(schema.checkIns).values([
    { userId: ids.accepted1, eventId: e1 },
    { userId: ids.outsider, eventId: sub },
  ]);
  const [team] = await db
    .insert(schema.teams)
    .values({ eventId: e1, organizerId: ids.accepted1, code: 'AUDTEAM1' })
    .returning({ id: schema.teams.id });
  await db.insert(schema.teamMembers).values({ teamId: team.id, userId: ids.accepted1, eventId: e1 });

  await db.insert(schema.marketingConsents).values([
    { userId: ids.accepted1, optedIn: true },
    { userId: ids.both, optedIn: true },
    { userId: ids.waitlisted, optedIn: false },
    { userId: ids.expired, optedIn: true },
    { userId: ids.outsider, optedIn: true },
    { userId: ids.unverified, optedIn: true },
  ]);

  const [r] = await db.insert(schema.role).values({ slug: 'audience-test-role' }).returning({ id: schema.role.id });
  roleId = r.id;
  await db.insert(schema.userRole).values({ userId: ids.accepted1, roleId });
});

afterAll(async () => {
  await db.delete(schema.events).where(inArray(schema.events.id, [sub, e1, e2]));
  await db.delete(schema.user).where(inArray(schema.user.id, Object.values(ids)));
  await db.delete(schema.role).where(inArray(schema.role.id, [roleId]));
});

describe('rule types', () => {
  test('participatedIn, any status', async () => {
    expect(await who(group([{ field: 'participatedIn', operator: '=', value: { eventId: e1 } }]))).toEqual([
      'accepted1',
      'both',
      'expired',
    ]);
  });

  test('participatedIn with a status set uses the effective status', async () => {
    expect(
      await who(
        group([
          {
            field: 'participatedIn',
            operator: '=',
            value: { eventId: e1, statuses: ['timed_out'] },
          },
        ]),
      ),
    ).toEqual(['expired']);
    expect(
      await who(
        group([
          {
            field: 'participatedIn',
            operator: '=',
            value: { eventId: e1, statuses: ['invited'] },
          },
        ]),
      ),
    ).toEqual([]);
  });

  test('checkedIn, for an event and for a sub-event', async () => {
    expect(await who(group([{ field: 'checkedIn', operator: '=', value: { eventId: e1 } }]))).toEqual(['accepted1']);
    expect(await who(group([{ field: 'checkedIn', operator: '=', value: { eventId: sub } }]))).toEqual(['outsider']);
  });

  test('onTeam', async () => {
    expect(await who(group([{ field: 'onTeam', operator: '=', value: { eventId: e1 } }]))).toEqual(['accepted1']);
  });

  test('hasRole', async () => {
    expect(await who(group([{ field: 'hasRole', operator: '=', value: { roleId } }]))).toEqual(['accepted1']);
  });

  test('marketingConsent: opted out is never reachable by marketing email', async () => {
    expect(
      await who(
        group([
          {
            field: 'marketingConsent',
            operator: '=',
            value: { optedIn: false },
          },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('negation and nesting', () => {
  test('"in event A AND NOT in event B"', async () => {
    expect(
      await who(
        group([
          { field: 'participatedIn', operator: '=', value: { eventId: e1 } },
          { field: 'participatedIn', operator: '!=', value: { eventId: e2 } },
        ]),
      ),
    ).toEqual(['accepted1', 'expired']);
  });

  test('"opted into marketing AND NOT accepted to event B"', async () => {
    expect(
      await who(
        group([
          {
            field: 'marketingConsent',
            operator: '=',
            value: { optedIn: true },
          },
          {
            field: 'participatedIn',
            operator: '!=',
            value: { eventId: e2, statuses: ['accepted'] },
          },
        ]),
      ),
    ).toEqual(['accepted1', 'expired', 'outsider']);
  });

  test('NOT on a whole group', async () => {
    expect(
      await who(
        group([
          {
            combinator: 'or',
            not: true,
            rules: [
              { field: 'onTeam', operator: '=', value: { eventId: e1 } },
              {
                field: 'participatedIn',
                operator: '=',
                value: { eventId: e2 },
              },
            ],
          },
        ]),
      ),
    ).toEqual(['expired', 'outsider']);
  });

  test('nested ANY inside ALL', async () => {
    expect(
      await who(
        group([
          { field: 'participatedIn', operator: '=', value: { eventId: e1 } },
          {
            combinator: 'or',
            rules: [
              { field: 'checkedIn', operator: '=', value: { eventId: e1 } },
              {
                field: 'participatedIn',
                operator: '=',
                value: { eventId: e1, statuses: ['timed_out'] },
              },
            ],
          },
        ]),
      ),
    ).toEqual(['accepted1', 'expired']);
  });

  test('an empty tree is everyone the campaign type allows', async () => {
    expect(await who(group([]))).toEqual(['accepted1', 'both', 'expired', 'outsider']);
  });
});

describe('forced conditions', () => {
  test('marketing: a tree targeting opted-out users still returns none of them', async () => {
    expect(
      await who(
        group([
          {
            field: 'participatedIn',
            operator: '=',
            value: { eventId: e1, statuses: ['waitlisted'] },
          },
        ]),
      ),
    ).toEqual([]);
  });

  test('operational: never leaves the event, but ignores consent', async () => {
    const operational: Campaigns.AudienceContext = { type: 'operational', eventId: e1 };
    expect(await who(group([]), operational)).toEqual(['accepted1', 'both', 'expired', 'waitlisted']);
    // Targeting E2 from an E1 operational campaign only reaches E1 participants.
    expect(await who(group([{ field: 'participatedIn', operator: '=', value: { eventId: e2 } }]), operational)).toEqual(
      ['both'],
    );
    expect(await who(group([{ field: 'checkedIn', operator: '=', value: { eventId: sub } }]), operational)).toEqual([]);
  });

  test('operational without an event is refused', async () => {
    await expect(Campaigns.resolveAudience(group([]), { type: 'operational', eventId: null })).rejects.toThrow(
      /event context/,
    );
  });

  test('unverified emails are never included', async () => {
    expect(await who(group([]), { type: 'operational', eventId: e1 })).not.toContain('unverified');
  });
});

describe('count and sample', () => {
  test('count agrees with the resolved list', async () => {
    const tree = group([{ field: 'participatedIn', operator: '=', value: { eventId: e1 } }]);
    expect(await Campaigns.countAudience(tree, MARKETING)).toBe(3);
    const sample = await Campaigns.sampleAudience(tree, MARKETING, 2);
    expect(sample).toHaveLength(2);
    expect(sample[0]).toEqual({
      id: ids.accepted1,
      name: 'Audience accepted1',
      email: 'audience-accepted1@example.com',
    });
  });
});

describe('validation', () => {
  test('rejects an unknown field', () => {
    expect(
      Campaigns.audienceRulesSchema.safeParse({
        combinator: 'and',
        rules: [{ field: 'email', operator: '=', value: 'x' }],
      }).success,
    ).toBe(false);
  });

  test('rejects malformed values', () => {
    for (const rule of [
      { field: 'participatedIn', operator: '=', value: { eventId: 'nope' } },
      {
        field: 'participatedIn',
        operator: '=',
        value: { eventId: e1, statuses: ['pending'] },
      },
      { field: 'hasRole', operator: '=', value: { roleId: '1; DROP' } },
      { field: 'onTeam', operator: 'contains', value: { eventId: e1 } },
      { field: 'marketingConsent', operator: '=', value: { optedIn: 'yes' } },
    ]) {
      expect(Campaigns.audienceRulesSchema.safeParse({ combinator: 'and', rules: [rule] }).success).toBe(false);
    }
  });

  test('rejects a bad combinator and over-deep nesting', () => {
    expect(Campaigns.audienceRulesSchema.safeParse({ combinator: 'xor', rules: [] }).success).toBe(false);
    let deep: unknown = { combinator: 'and', rules: [] };
    for (let i = 0; i < 6; i++) deep = { combinator: 'and', rules: [deep] };
    expect(Campaigns.audienceRulesSchema.safeParse(deep).success).toBe(false);
  });

  test('accepts react-querybuilder ids', () => {
    expect(
      Campaigns.audienceRulesSchema.safeParse({
        id: 'root',
        combinator: 'and',
        rules: [
          {
            id: 'r1',
            field: 'onTeam',
            operator: '=',
            value: { eventId: e1 },
          },
        ],
      }).success,
    ).toBe(true);
  });
});
