import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  campaigns,
  events,
  marketingConsents,
  permission,
  savedAudiences,
  user,
  userPermission,
} from '@/db/schema';
import { countAudience } from '@/lib/campaigns/audience';
import type { AudienceRuleGroup } from '@/lib/campaigns/audience-rules';
import { currentCampaignRules } from '@/lib/campaigns/saved-audiences';
import { insertAttendees } from '@/tests/participation-fixtures';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  updateTag: vi.fn(),
  refresh: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import { createCampaign } from '@/app/dashboard/admin/campaigns/actions';
import {
  createSavedAudience,
  deleteSavedAudience,
  detachCampaignAudience,
  linkCampaignAudience,
  saveCampaignAudienceAs,
  updateSavedAudience,
} from '@/app/dashboard/admin/campaigns/audience-actions';

let writerId: string;
const memberIds: string[] = [];
let eventA: string;
let eventB: string;
const campaignIds: string[] = [];
const audienceIds: string[] = [];

const inEvent = (eventId: string): AudienceRuleGroup => ({
  combinator: 'and',
  rules: [{ field: 'participatedIn', operator: '=', value: { eventId } }],
});

async function campaignCount(campaignId: string): Promise<number> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  const rules = await currentCampaignRules(row);
  return countAudience(rules!, { type: row.type, eventId: row.eventId });
}

async function newCampaign(name: string): Promise<string> {
  const result = await createCampaign({
    name,
    type: 'marketing',
    eventId: null,
  });
  if (!result.success) throw new Error(result.error);
  campaignIds.push(result.data!.id);
  return result.data!.id;
}

beforeAll(async () => {
  const [writer] = await db
    .insert(user)
    .values({
      name: 'Audience writer',
      email: 'saved-audience-writer@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  writerId = writer.id;
  const [perm] = await db
    .insert(permission)
    .values({ slug: 'campaign:write:all' })
    .onConflictDoUpdate({
      target: permission.slug,
      set: { slug: 'campaign:write:all' },
    })
    .returning({ id: permission.id });
  await db
    .insert(userPermission)
    .values({ userId: writerId, permissionId: perm.id });
  vi.mocked(getUser).mockResolvedValue({
    id: writerId,
  } as Awaited<ReturnType<typeof getUser>>);

  const [a] = await db
    .insert(events)
    .values({ name: 'Saved audience A' })
    .returning({ id: events.id });
  const [b] = await db
    .insert(events)
    .values({ name: 'Saved audience B' })
    .returning({ id: events.id });
  eventA = a.id;
  eventB = b.id;

  // One member in A, two in B, all opted in.
  for (let i = 0; i < 3; i++) {
    const [m] = await db
      .insert(user)
      .values({
        name: `Saved audience member ${i}`,
        email: `saved-audience-member-${i}@example.com`,
        emailVerified: true,
      })
      .returning({ id: user.id });
    memberIds.push(m.id);
    await db.insert(marketingConsents).values({ userId: m.id, optedIn: true });
  }
  await insertAttendees([
    { eventId: eventA, userId: memberIds[0] },
    { eventId: eventB, userId: memberIds[1] },
    { eventId: eventB, userId: memberIds[2] },
  ]);
});

afterAll(async () => {
  await db.delete(campaigns).where(inArray(campaigns.id, campaignIds));
  if (audienceIds.length) {
    await db
      .delete(savedAudiences)
      .where(inArray(savedAudiences.id, audienceIds));
  }
  await db.delete(events).where(inArray(events.id, [eventA, eventB]));
  await db.delete(user).where(inArray(user.id, [writerId, ...memberIds]));
});

describe('linked saved audiences', () => {
  test('editing a linked audience changes linked counts; detached campaigns keep theirs', async () => {
    const created = await createSavedAudience({
      name: 'Event A people',
      rules: inEvent(eventA),
    });
    expect(created.success).toBe(true);
    const audienceId = created.success ? created.data!.id : '';
    audienceIds.push(audienceId);

    const linked = await newCampaign('Linked');
    const detached = await newCampaign('Detached');
    expect((await linkCampaignAudience(linked, audienceId)).success).toBe(true);
    expect((await linkCampaignAudience(detached, audienceId)).success).toBe(
      true,
    );
    const [linkedRow] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, linked));
    expect(linkedRow.audienceRules).toBeNull();
    expect(linkedRow.savedAudienceId).toBe(audienceId);

    expect(await detachCampaignAudience(detached)).toMatchObject({
      success: true,
    });
    const [detachedRow] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, detached));
    expect(detachedRow.savedAudienceId).toBeNull();
    expect(detachedRow.audienceRules).toEqual(inEvent(eventA));

    expect(await campaignCount(linked)).toBe(1);
    expect(await campaignCount(detached)).toBe(1);

    expect(
      (
        await updateSavedAudience(audienceId, {
          name: 'Event B people',
          rules: inEvent(eventB),
        })
      ).success,
    ).toBe(true);

    expect(await campaignCount(linked)).toBe(2);
    expect(await campaignCount(detached)).toBe(1);
  });

  test('deleting an audience that campaigns use is blocked until they detach', async () => {
    const created = await createSavedAudience({ name: 'In use' });
    const audienceId = created.success ? created.data!.id : '';
    audienceIds.push(audienceId);
    const campaignId = await newCampaign('Uses it');
    await linkCampaignAudience(campaignId, audienceId);

    expect(await deleteSavedAudience(audienceId)).toEqual({
      success: false,
      error: '1 campaign uses this audience. Detach it before deleting.',
    });

    await detachCampaignAudience(campaignId);
    expect((await deleteSavedAudience(audienceId)).success).toBe(true);
    expect(
      await db
        .select()
        .from(savedAudiences)
        .where(eq(savedAudiences.id, audienceId)),
    ).toHaveLength(0);
  });

  test('"Save as audience" copies the inline rules into a new audience and links it', async () => {
    const campaignId = await newCampaign('Save as');
    await db
      .update(campaigns)
      .set({ audienceRules: inEvent(eventB) })
      .where(eq(campaigns.id, campaignId));

    const result = await saveCampaignAudienceAs(campaignId, 'From campaign');
    expect(result.success).toBe(true);
    const audienceId = result.success ? result.data!.id : '';
    audienceIds.push(audienceId);

    const [audience] = await db
      .select()
      .from(savedAudiences)
      .where(eq(savedAudiences.id, audienceId));
    expect(audience.rules).toEqual(inEvent(eventB));
    const [row] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    expect(row).toMatchObject({
      savedAudienceId: audienceId,
      audienceRules: null,
    });
  });

  test('non-drafts cannot be linked or detached', async () => {
    const created = await createSavedAudience({ name: 'Late' });
    const audienceId = created.success ? created.data!.id : '';
    audienceIds.push(audienceId);
    const campaignId = await newCampaign('Already scheduled');
    await db
      .update(campaigns)
      .set({ status: 'scheduled' })
      .where(eq(campaigns.id, campaignId));
    expect((await linkCampaignAudience(campaignId, audienceId)).success).toBe(
      false,
    );
  });

  test('rejects invalid names and rules', async () => {
    expect((await createSavedAudience({ name: '  ' })).success).toBe(false);
    expect(
      (
        await createSavedAudience({
          name: 'Bad',
          rules: { combinator: 'nand' } as never,
        })
      ).success,
    ).toBe(false);
  });
});
