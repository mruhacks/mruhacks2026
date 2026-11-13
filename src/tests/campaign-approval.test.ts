/**
 * A campaign send takes two people: one asks for it, a different one approves
 * it. These cover the rules that make that hold, rather than the pipeline the
 * approved send then runs through (campaign-send-pipeline.test.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import * as Campaigns from '@/lib/campaigns/server';
import { insertAttendees } from '@/tests/participation-fixtures';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@vercel/queue', () => ({ send }));
vi.mock('@/utils/auth', () => ({ getUser: vi.fn(), getImpersonatedUser: vi.fn() }));
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  updateTag: vi.fn(),
  refresh: vi.fn(),
}));

import { getImpersonatedUser, getUser } from '@/utils/auth';
import { updateCampaignAudience, updateCampaignContent } from '@/app/dashboard/admin/campaigns/actions';
import { linkCampaignAudience, updateSavedAudience } from '@/app/dashboard/admin/campaigns/audience-actions';
import {
  approveCampaign,
  cancelApprovalRequest,
  getApprovalSummary,
  requestSchedule,
  requestSendNow,
} from '@/app/dashboard/admin/campaigns/send-actions';

type User = Awaited<ReturnType<typeof getUser>>;

const ALL = ['campaign:write:all', 'campaign:send:all', 'campaign:approve:all'];
const userIds: string[] = [];
const campaignIds: string[] = [];
const audienceIds: string[] = [];
const permissionIds = new Map<string, number>();
let eventId: string;
let alice: string; // can ask and approve
let bob: string; // can ask and approve
let sendOnly: string;
let memberA: string;
let memberB: string;

const FORBIDDEN = /REDIRECT:\/forbidden/;
const HOUR = 3600_000;
function wholeHour(offsetHours: number): Date {
  const d = new Date(Date.now() + offsetHours * HOUR);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

const everyoneInEvent = (): Campaigns.AudienceRuleGroup => ({
  combinator: 'and',
  rules: [{ field: 'participatedIn', operator: '=', value: { eventId } }],
});

async function permissionId(slug: string): Promise<number> {
  const known = permissionIds.get(slug);
  if (known) return known;
  const [row] = await db
    .insert(schema.permission)
    .values({ slug })
    .onConflictDoUpdate({ target: schema.permission.slug, set: { slug } })
    .returning({ id: schema.permission.id });
  permissionIds.set(slug, row.id);
  return row.id;
}

async function newUser(name: string, permissions: string[] = []): Promise<string> {
  const [row] = await db
    .insert(schema.user)
    .values({ name, email: `approval-${name.toLowerCase().replace(/\W+/g, '-')}@example.com`, emailVerified: true })
    .returning({ id: schema.user.id });
  userIds.push(row.id);
  for (const slug of permissions) {
    await db.insert(schema.userPermission).values({ userId: row.id, permissionId: await permissionId(slug) });
  }
  return row.id;
}

async function revoke(userId: string, slug: string) {
  await db
    .delete(schema.userPermission)
    .where(
      and(eq(schema.userPermission.userId, userId), eq(schema.userPermission.permissionId, await permissionId(slug))),
    );
}

const as = (id: string) => vi.mocked(getUser).mockResolvedValue({ id } as User);

async function newDraft(overrides: Partial<typeof schema.campaigns.$inferInsert> = {}): Promise<string> {
  const [row] = await db
    .insert(schema.campaigns)
    .values({
      name: 'Approval',
      type: 'marketing',
      subject: 'Hello',
      bodyMarkdown: 'Body',
      audienceRules: everyoneInEvent(),
      ...overrides,
    })
    .returning({ id: schema.campaigns.id });
  campaignIds.push(row.id);
  return row.id;
}

async function campaignRow(id: string) {
  const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
  return row;
}

async function auditActions(id: string): Promise<string[]> {
  const rows = await db
    .select({ action: schema.auditLog.action })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.targetId, id))
    .orderBy(schema.auditLog.createdAt);
  return rows.map((row) => row.action);
}

beforeAll(async () => {
  const [event] = await db.insert(schema.events).values({ name: 'Approval event' }).returning({ id: schema.events.id });
  eventId = event.id;
  alice = await newUser('Alice', ALL);
  bob = await newUser('Bob', ALL);
  sendOnly = await newUser('Send only', ['campaign:send:all']);
  memberA = await newUser('Member A');
  memberB = await newUser('Member B');
  await db.insert(schema.marketingConsents).values([
    { userId: memberA, optedIn: true },
    { userId: memberB, optedIn: true },
  ]);
  await insertAttendees({ eventId, userId: memberA });
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ messageId: 'm' });
  vi.mocked(getImpersonatedUser).mockReset();
  as(alice);
});

afterAll(async () => {
  await db.delete(schema.campaigns).where(inArray(schema.campaigns.id, campaignIds));
  if (audienceIds.length > 0) {
    await db.delete(schema.savedAudiences).where(inArray(schema.savedAudiences.id, audienceIds));
  }
  await db.delete(schema.events).where(eq(schema.events.id, eventId));
  await db.delete(schema.user).where(inArray(schema.user.id, userIds));
});

describe('who can approve', () => {
  test('not the person who asked, even though they hold the permission', async () => {
    const id = await newDraft();
    expect((await requestSendNow(id)).success).toBe(true);

    expect(await approveCampaign(id)).toEqual({
      success: false,
      error: 'You asked for this send, so someone else has to approve it.',
    });
    expect(await getApprovalSummary(id)).toMatchObject({
      success: true,
      data: { recipients: 1, problems: ['You asked for this send, so someone else has to approve it.'] },
    });
    expect((await campaignRow(id)).status).toBe('pending_approval');
    expect(send).not.toHaveBeenCalled();

    as(bob);
    expect(await approveCampaign(id)).toEqual({ success: true, data: undefined });
    expect(await campaignRow(id)).toMatchObject({
      status: 'scheduled',
      approvalRequestedBy: alice,
      approvedBy: bob,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await auditActions(id)).toEqual(['campaign.approval_requested', 'campaign.approved']);
  });

  test('not someone without campaign:approve:all', async () => {
    const id = await newDraft();
    expect((await requestSendNow(id)).success).toBe(true);
    as(sendOnly);
    await expect(approveCampaign(id)).rejects.toThrow(FORBIDDEN);
    await expect(getApprovalSummary(id)).rejects.toThrow(FORBIDDEN);
    expect((await campaignRow(id)).status).toBe('pending_approval');
  });

  test('an operational campaign needs campaign:operational:all on both sides', async () => {
    const organizer = await newUser('Organizer', [...ALL, 'campaign:operational:all']);
    const id = await newDraft({ type: 'operational', eventId });

    await expect(requestSendNow(id)).rejects.toThrow(FORBIDDEN);
    as(organizer);
    expect((await requestSendNow(id)).success).toBe(true);

    // Bob can approve marketing sends, but not this one.
    as(bob);
    await expect(approveCampaign(id)).rejects.toThrow(FORBIDDEN);
    await expect(cancelApprovalRequest(id)).rejects.toThrow(FORBIDDEN);
    expect((await campaignRow(id)).status).toBe('pending_approval');
  });

  test('neither step can be taken while impersonating someone', async () => {
    const id = await newDraft();
    vi.mocked(getImpersonatedUser).mockResolvedValue({ id: alice } as User);
    expect(await requestSendNow(id)).toMatchObject({ success: false, error: expect.stringMatching(/impersonating/) });
    expect(await requestSchedule(id, wholeHour(3).toISOString())).toMatchObject({
      success: false,
      error: expect.stringMatching(/impersonating/),
    });
    expect((await campaignRow(id)).status).toBe('draft');

    vi.mocked(getImpersonatedUser).mockResolvedValue(null);
    expect((await requestSendNow(id)).success).toBe(true);
    as(bob);
    vi.mocked(getImpersonatedUser).mockResolvedValue({ id: bob } as User);
    expect(await approveCampaign(id)).toMatchObject({ success: false, error: expect.stringMatching(/impersonating/) });
    expect((await campaignRow(id)).status).toBe('pending_approval');
  });
});

describe('a request that can no longer be approved', () => {
  test('whoever asked has since lost send access', async () => {
    const leaver = await newUser('Leaver', ['campaign:send:all']);
    const id = await newDraft();
    as(leaver);
    expect((await requestSchedule(id, wholeHour(4).toISOString())).success).toBe(true);
    await revoke(leaver, 'campaign:send:all');

    as(bob);
    expect(await approveCampaign(id)).toMatchObject({
      success: false,
      error: expect.stringMatching(/can no longer send campaigns/),
    });
    expect((await campaignRow(id)).status).toBe('pending_approval');
  });

  test('whoever asked has deleted their account', async () => {
    const gone = await newUser('Gone', ['campaign:send:all']);
    const id = await newDraft();
    as(gone);
    expect((await requestSendNow(id)).success).toBe(true);
    await db.delete(schema.user).where(eq(schema.user.id, gone));

    as(bob);
    expect(await approveCampaign(id)).toMatchObject({
      success: false,
      error: expect.stringMatching(/no longer has an account/),
    });
    expect(send).not.toHaveBeenCalled();
  });

  test('the hour it was meant to send has passed', async () => {
    const id = await newDraft();
    expect((await requestSchedule(id, wholeHour(2).toISOString())).success).toBe(true);
    await db
      .update(schema.campaigns)
      .set({ scheduledFor: wholeHour(-1) })
      .where(eq(schema.campaigns.id, id));

    as(bob);
    expect(await approveCampaign(id)).toMatchObject({
      success: false,
      error: expect.stringMatching(/has passed/),
    });
    expect((await campaignRow(id)).status).toBe('pending_approval');
  });

  test('the content stopped being sendable', async () => {
    const id = await newDraft();
    expect((await requestSendNow(id)).success).toBe(true);
    await db.update(schema.campaigns).set({ subject: '' }).where(eq(schema.campaigns.id, id));
    as(bob);
    expect(await approveCampaign(id)).toEqual({ success: false, error: 'Add a subject line.' });
  });

  test("a draft, or one that's already approved", async () => {
    const id = await newDraft();
    as(bob);
    expect(await approveCampaign(id)).toMatchObject({
      success: false,
      error: expect.stringMatching(/isn’t waiting for approval/),
    });

    as(alice);
    expect((await requestSendNow(id)).success).toBe(true);
    as(bob);
    expect((await approveCampaign(id)).success).toBe(true);
    expect((await approveCampaign(id)).success).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('what was approved is what goes out', () => {
  test('a campaign waiting for approval is locked', async () => {
    const id = await newDraft();
    expect((await requestSendNow(id)).success).toBe(true);

    expect(
      await updateCampaignContent(id, { name: 'Approval', subject: 'Changed', previewText: '', bodyMarkdown: 'New' }),
    ).toMatchObject({ success: false, error: expect.stringMatching(/Only drafts/) });
    expect(await updateCampaignAudience(id, { combinator: 'and', rules: [] })).toMatchObject({
      success: false,
      error: expect.stringMatching(/Only drafts/),
    });
    expect(await campaignRow(id)).toMatchObject({ subject: 'Hello', audienceRules: everyoneInEvent() });
  });

  test('editing a linked saved audience after the request does not change who it reaches', async () => {
    const [audience] = await db
      .insert(schema.savedAudiences)
      .values({ name: 'Event people', rules: everyoneInEvent() })
      .returning({ id: schema.savedAudiences.id });
    audienceIds.push(audience.id);
    const id = await newDraft();
    expect((await linkCampaignAudience(id, audience.id)).success).toBe(true);
    expect((await requestSendNow(id)).success).toBe(true);

    // Widened from the event's one participant to every opted-in user.
    expect(
      (await updateSavedAudience(audience.id, { name: 'Event people', rules: { combinator: 'and', rules: [] } }))
        .success,
    ).toBe(true);

    as(bob);
    expect(await getApprovalSummary(id)).toMatchObject({ data: { recipients: 1, problems: [] } });
    expect((await approveCampaign(id)).success).toBe(true);
    const row = await campaignRow(id);
    expect(await Campaigns.processCampaignDispatch(id, row.scheduledFor!.toISOString())).toMatchObject({
      kind: 'dispatched',
      recipients: 1,
    });
    const deliveries = await db
      .select({ userId: schema.campaignDeliveries.userId })
      .from(schema.campaignDeliveries)
      .where(eq(schema.campaignDeliveries.campaignId, id));
    expect(deliveries).toEqual([{ userId: memberA }]);
  });
});

describe('sending a request back to draft', () => {
  test('whoever asked can withdraw it, and it can be edited and asked for again', async () => {
    const id = await newDraft();
    expect((await requestSchedule(id, wholeHour(6).toISOString())).success).toBe(true);
    expect(await cancelApprovalRequest(id)).toEqual({ success: true, data: undefined });
    expect(await campaignRow(id)).toMatchObject({
      status: 'draft',
      scheduledFor: null,
      audienceSnapshot: null,
      approvalRequestedBy: null,
      approvalRequestedAt: null,
    });
    expect(await auditActions(id)).toEqual(['campaign.approval_requested', 'campaign.approval_withdrawn']);

    expect(
      (await updateCampaignContent(id, { name: 'Approval', subject: 'Take two', previewText: '', bodyMarkdown: 'B' }))
        .success,
    ).toBe(true);
    expect((await requestSendNow(id)).success).toBe(true);
  });

  test('an approver can turn it down; someone with neither permission cannot', async () => {
    const id = await newDraft();
    expect((await requestSendNow(id)).success).toBe(true);

    as(await newUser('Writer', ['campaign:write:all']));
    await expect(cancelApprovalRequest(id)).rejects.toThrow(FORBIDDEN);

    as(bob);
    expect(await cancelApprovalRequest(id)).toEqual({ success: true, data: undefined });
    expect((await campaignRow(id)).status).toBe('draft');
    expect(await auditActions(id)).toEqual(['campaign.approval_requested', 'campaign.approval_rejected']);
    // Nothing left to approve or cancel.
    expect((await cancelApprovalRequest(id)).success).toBe(false);
    expect((await approveCampaign(id)).success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
