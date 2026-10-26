import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import { insertAttendees } from '@/tests/participation-fixtures';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@vercel/queue', () => ({ send }));
vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  refresh: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import * as Campaigns from '@/lib/campaigns/server';
import { scheduleCampaign, unscheduleCampaign } from '@/app/dashboard/admin/campaigns/send-actions';

let senderId: string;
let memberId: string;
let eventId: string;
const campaignIds: string[] = [];

const HOUR = 3600_000;
function wholeHour(offsetHours: number): Date {
  const d = new Date(Date.now() + offsetHours * HOUR);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

async function newCampaign(overrides: Partial<typeof schema.campaigns.$inferInsert> = {}): Promise<string> {
  const [row] = await db
    .insert(schema.campaigns)
    .values({
      name: 'Scheduled',
      type: 'marketing',
      subject: 'Hello',
      bodyMarkdown: 'Body',
      audienceRules: {
        combinator: 'and',
        rules: [{ field: 'participatedIn', operator: '=', value: { eventId } }],
      },
      ...overrides,
    })
    .returning({ id: schema.campaigns.id });
  campaignIds.push(row.id);
  return row.id;
}

/** Dispatch messages the cron published for one campaign. */
function dispatchesFor(id: string) {
  return send.mock.calls.filter((c) => c[0] === 'campaign-dispatch' && c[1].campaignId === id);
}

beforeAll(async () => {
  const [event] = await db
    .insert(schema.events)
    .values({ name: 'Scheduling event' })
    .returning({ id: schema.events.id });
  eventId = event.id;
  const [member] = await db
    .insert(schema.user)
    .values({
      name: 'Scheduled member',
      email: 'scheduling-member@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  memberId = member.id;
  await db.insert(schema.marketingConsents).values({ userId: memberId, optedIn: true });
  await insertAttendees({ eventId, userId: memberId });

  const [sender] = await db
    .insert(schema.user)
    .values({
      name: 'Scheduler',
      email: 'scheduling-sender@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  senderId = sender.id;
  const [p] = await db
    .insert(schema.permission)
    .values({ slug: 'campaign:send:all' })
    .onConflictDoUpdate({
      target: schema.permission.slug,
      set: { slug: 'campaign:send:all' },
    })
    .returning({ id: schema.permission.id });
  await db.insert(schema.userPermission).values({ userId: senderId, permissionId: p.id });
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ messageId: 'm' });
  vi.mocked(getUser).mockResolvedValue({
    id: senderId,
  } as Awaited<ReturnType<typeof getUser>>);
});

afterAll(async () => {
  await db.delete(schema.campaigns).where(inArray(schema.campaigns.id, campaignIds));
  await db.delete(schema.events).where(eq(schema.events.id, eventId));
  await db.delete(schema.user).where(inArray(schema.user.id, [senderId, memberId]));
});

describe('scheduling', () => {
  test('only whole hours in the future', async () => {
    const id = await newCampaign();
    const halfPast = new Date(wholeHour(2).getTime() + 30 * 60_000);
    expect(await scheduleCampaign(id, halfPast.toISOString())).toEqual({
      success: false,
      error: 'Campaigns can only be scheduled on the hour.',
    });
    expect(await scheduleCampaign(id, wholeHour(-1).toISOString())).toEqual({
      success: false,
      error: 'Choose an hour in the future.',
    });
    expect(await scheduleCampaign(id, 'tomorrow at 9')).toMatchObject({
      success: false,
    });

    const at = wholeHour(3);
    expect(await scheduleCampaign(id, at.toISOString())).toEqual({
      success: true,
      data: undefined,
    });
    const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
    expect(row.status).toBe('scheduled');
    expect(row.scheduledFor?.toISOString()).toBe(at.toISOString());
  });

  test('a scheduled campaign can be unscheduled back to draft', async () => {
    const id = await newCampaign();
    await scheduleCampaign(id, wholeHour(5).toISOString());
    expect(await unscheduleCampaign(id)).toEqual({
      success: true,
      data: undefined,
    });
    const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
    expect(row).toMatchObject({ status: 'draft', scheduledFor: null });
  });
});

describe('hourly dispatch', () => {
  test('a due campaign is dispatched exactly once even if the cron runs twice', async () => {
    const due = wholeHour(-1);
    const id = await newCampaign({ status: 'scheduled', scheduledFor: due });
    const future = await newCampaign({
      status: 'scheduled',
      scheduledFor: wholeHour(4),
    });

    await Campaigns.dispatchDueCampaigns();
    await Campaigns.dispatchDueCampaigns();

    // Both runs publish with the same idempotency key, so the queue keeps one…
    const published = dispatchesFor(id);
    expect(published).toHaveLength(2);
    expect(new Set(published.map((c) => c[2].idempotencyKey))).toEqual(new Set([`${id}:${due.toISOString()}`]));
    expect(dispatchesFor(future)).toHaveLength(0);

    // …and even if both were delivered, only one claims the campaign.
    const first = await Campaigns.processCampaignDispatch(id, due.toISOString());
    const second = await Campaigns.processCampaignDispatch(id, due.toISOString());
    expect(first).toMatchObject({ kind: 'dispatched', recipients: 1 });
    expect(second).toMatchObject({ kind: 'resumed' });
    expect(
      await db.select().from(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.campaignId, id)),
    ).toHaveLength(1);
  });

  test('an unscheduled campaign is not dispatched', async () => {
    const id = await newCampaign({
      status: 'scheduled',
      scheduledFor: wholeHour(-2),
    });
    expect((await unscheduleCampaign(id)).success).toBe(true);
    await Campaigns.dispatchDueCampaigns();
    expect(dispatchesFor(id)).toHaveLength(0);
    // A dispatch message that was already in flight doesn't claim it either.
    expect(await Campaigns.processCampaignDispatch(id, wholeHour(-2).toISOString())).toEqual({
      kind: 'not_scheduled',
      status: 'draft',
    });
  });

  test('old dispatches cannot send a rescheduled campaign, even after it becomes due', async () => {
    const oldTime = wholeHour(-2);
    const id = await newCampaign({
      status: 'scheduled',
      scheduledFor: oldTime,
    });
    await unscheduleCampaign(id);
    const future = wholeHour(3);
    expect((await scheduleCampaign(id, future.toISOString())).success).toBe(true);
    expect(await Campaigns.processCampaignDispatch(id, oldTime.toISOString())).toEqual({
      kind: 'stale_schedule',
    });
    expect(await Campaigns.processCampaignDispatch(id, future.toISOString())).toEqual({
      kind: 'stale_schedule',
    });
    const laterDue = wholeHour(-1);
    await db.update(schema.campaigns).set({ scheduledFor: laterDue }).where(eq(schema.campaigns.id, id));
    expect(await Campaigns.processCampaignDispatch(id, oldTime.toISOString())).toEqual({
      kind: 'stale_schedule',
    });
    expect(send).not.toHaveBeenCalled();
    expect(await Campaigns.processCampaignDispatch(id, laterDue.toISOString())).toMatchObject({
      kind: 'dispatched',
      recipients: 1,
    });
  });

  test('the scheduler recovers queued deliveries of a sending campaign', async () => {
    const id = await newCampaign({
      status: 'sending',
      scheduledFor: wholeHour(-1),
    });
    const [delivery] = await db
      .insert(schema.campaignDeliveries)
      .values({
        campaignId: id,
        userId: memberId,
        email: 'scheduling-member@example.com',
        attempts: 1,
      })
      .returning();
    await Campaigns.dispatchDueCampaigns();
    expect(send).toHaveBeenCalledWith(
      'campaign-deliveries',
      { deliveryId: delivery.id },
      { idempotencyKey: `${delivery.id}:1`, delaySeconds: 0 },
    );
  });

  test('a publish failure fails the run', async () => {
    await newCampaign({ status: 'scheduled', scheduledFor: wholeHour(-3) });
    send.mockRejectedValue(new Error('queue down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(Campaigns.dispatchDueCampaigns()).rejects.toThrow(/due campaign/);
    vi.restoreAllMocks();
  });
});
