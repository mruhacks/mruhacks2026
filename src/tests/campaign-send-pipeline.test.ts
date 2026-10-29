import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import * as Campaigns from '@/lib/campaigns/server';
import { insertAttendees } from '@/tests/participation-fixtures';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@vercel/queue', () => ({ send }));
vi.mock('@/utils/mail', () => ({ sendMail: vi.fn() }));
vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  updateTag: vi.fn(),
  refresh: vi.fn(),
}));

import { sendMail } from '@/utils/mail';
import { getUser } from '@/utils/auth';
import {
  getCampaignResults,
  getSendSummary,
  retryFailedDeliveries,
  sendCampaignNow,
  stopCampaign,
} from '@/app/dashboard/admin/campaigns/send-actions';

const memberIds: string[] = [];
let senderId: string;
let eventId: string;
const campaignIds: string[] = [];
const savedKey = process.env.APP_SIGNING_PRIVATE_KEY;

const everyoneInEvent = (): Campaigns.AudienceRuleGroup => ({
  combinator: 'and',
  rules: [{ field: 'participatedIn', operator: '=', value: { eventId } }],
});

async function newCampaign(overrides: Partial<typeof schema.campaigns.$inferInsert> = {}): Promise<string> {
  const [row] = await db
    .insert(schema.campaigns)
    .values({
      name: 'Pipeline',
      type: 'marketing',
      subject: 'Hi {{firstName}}',
      bodyMarkdown: 'Hello',
      audienceRules: everyoneInEvent(),
      status: 'scheduled',
      scheduledFor: new Date(),
      updatedBy: senderId,
      ...overrides,
    })
    .returning({ id: schema.campaigns.id });
  campaignIds.push(row.id);
  return row.id;
}

async function processCampaignDispatch(id: string) {
  const row = await campaignRow(id);
  return Campaigns.processCampaignDispatch(id, row.scheduledFor?.toISOString() ?? '');
}

async function deliveriesOf(campaignId: string) {
  return db.select().from(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.campaignId, campaignId));
}

async function campaignRow(campaignId: string) {
  const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  return row;
}

beforeAll(async () => {
  process.env.APP_SIGNING_PRIVATE_KEY = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey as unknown as string;

  const [event] = await db.insert(schema.events).values({ name: 'Pipeline event' }).returning({ id: schema.events.id });
  eventId = event.id;

  // 12 opted-in members, so pacing crosses a 10-per-second boundary.
  const rows = await db
    .insert(schema.user)
    .values(
      Array.from({ length: 12 }, (_, i) => ({
        name: `Pipeline ${i}`,
        email: `pipeline-${i}@example.com`,
        emailVerified: true,
      })),
    )
    .returning({ id: schema.user.id });
  memberIds.push(...rows.map((r) => r.id));
  await db.insert(schema.marketingConsents).values(memberIds.map((userId) => ({ userId, optedIn: true })));
  await insertAttendees(memberIds.map((userId) => ({ eventId, userId })));

  const [sender] = await db
    .insert(schema.user)
    .values({
      name: 'Pipeline sender',
      email: 'pipeline-sender@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  senderId = sender.id;
  for (const slug of ['campaign:send:all', 'campaign:read:all', 'participant:read:all']) {
    const [p] = await db
      .insert(schema.permission)
      .values({ slug })
      .onConflictDoUpdate({ target: schema.permission.slug, set: { slug } })
      .returning({ id: schema.permission.id });
    await db.insert(schema.userPermission).values({ userId: senderId, permissionId: p.id });
  }
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ messageId: 'm' });
  vi.mocked(sendMail).mockReset();
  vi.mocked(sendMail).mockResolvedValue(undefined);
  vi.mocked(getUser).mockResolvedValue({
    id: senderId,
    name: 'Pipeline sender',
    email: 'pipeline-sender@example.com',
  } as Awaited<ReturnType<typeof getUser>>);
});

afterAll(async () => {
  await db.delete(schema.campaigns).where(inArray(schema.campaigns.id, campaignIds));
  await db.delete(schema.events).where(eq(schema.events.id, eventId));
  await db.delete(schema.user).where(inArray(schema.user.id, [...memberIds, senderId]));
  if (savedKey === undefined) delete process.env.APP_SIGNING_PRIVATE_KEY;
  else process.env.APP_SIGNING_PRIVATE_KEY = savedKey;
});

describe('dispatch', () => {
  test('claims the campaign, snapshots the rules, writes deliveries and paces them ~10/s', async () => {
    const id = await newCampaign();
    const outcome = await processCampaignDispatch(id);
    expect(outcome).toEqual({
      kind: 'dispatched',
      recipients: 12,
      published: 12,
    });

    const row = await campaignRow(id);
    expect(row.status).toBe('sending');
    expect(row.audienceSnapshot).toEqual(everyoneInEvent());
    const deliveries = await deliveriesOf(id);
    expect(deliveries).toHaveLength(12);
    expect(deliveries.every((d) => d.status === 'queued')).toBe(true);

    const delays = send.mock.calls.map((c) => c[2].delaySeconds);
    expect(delays).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    expect(send.mock.calls[0][0]).toBe('campaign-deliveries');
    expect(send.mock.calls[0][2].idempotencyKey).toMatch(/:0$/);

    const [audit] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'campaign.dispatch'), eq(schema.auditLog.targetId, id)));
    expect(audit.metadata).toMatchObject({
      recipients: 12,
      audienceRules: everyoneInEvent(),
    });
  });

  test('a duplicate dispatch never claims twice', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    send.mockClear();
    // Redelivered while still sending: only re-publishes still-queued rows,
    // whose idempotency keys are unchanged, and writes no new rows.
    const again = await processCampaignDispatch(id);
    expect(again).toEqual({ kind: 'resumed', published: 12 });
    expect(await deliveriesOf(id)).toHaveLength(12);
    expect(new Set(send.mock.calls.map((c) => c[2].idempotencyKey)).size).toBe(12);
  });

  test('a draft or cancelled campaign is not dispatched', async () => {
    const draft = await newCampaign({ status: 'draft' });
    expect(await processCampaignDispatch(draft)).toEqual({
      kind: 'not_scheduled',
      status: 'draft',
    });
    expect(send).not.toHaveBeenCalled();
  });

  test('an audience of nobody is sent immediately', async () => {
    const id = await newCampaign({
      audienceRules: {
        combinator: 'and',
        rules: [
          { field: 'participatedIn', operator: '!=', value: { eventId } },
          { field: 'participatedIn', operator: '=', value: { eventId } },
        ],
      },
    });
    expect(await processCampaignDispatch(id)).toMatchObject({ recipients: 0 });
    expect((await campaignRow(id)).status).toBe('sent');
  });

  test('pacing helper', () => {
    expect([0, 9, 10, 25, 99, 100].map(Campaigns.deliveryDelaySeconds)).toEqual([0, 0, 1, 2, 9, 10]);
  });
});

describe('delivery', () => {
  test('sends, marks sent, and completes the campaign after the last one', async () => {
    // Two deliveries written by hand, rather than the whole audience.
    const id = await newCampaign({ status: 'sending' });
    await db.insert(schema.campaignDeliveries).values([
      { campaignId: id, userId: memberIds[0], email: 'pipeline-0@example.com' },
      { campaignId: id, userId: memberIds[1], email: 'pipeline-1@example.com' },
    ]);
    const [a, b] = await deliveriesOf(id);

    expect(await Campaigns.processCampaignDelivery(a.id)).toBe('sent');
    expect((await campaignRow(id)).status).toBe('sending');
    expect(await Campaigns.processCampaignDelivery(b.id)).toBe('sent');
    expect((await campaignRow(id)).status).toBe('sent');

    expect(sendMail).toHaveBeenCalledTimes(2);
    const mail = vi.mocked(sendMail).mock.calls[0][0];
    expect(mail.subject).toMatch(/^Hi Pipeline$/);
    expect(mail.listUnsubscribeUrl).toMatch(/\/api\/unsubscribe\?t=/);
    const [sent] = await db.select().from(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.id, a.id));
    expect(sent).toMatchObject({ status: 'sent', attempts: 1 });
    expect(sent.sentAt).toBeInstanceOf(Date);
  });

  test('concurrent wallet deliveries render without exhausting the connection pool', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await newCampaign({
        eventId,
        bodyMarkdown: 'Your pass\n\n::wallet',
      });
      ids.push(id);
      await processCampaignDispatch(id);
    }
    const deliveries = (await Promise.all(ids.map(deliveriesOf))).flat();
    expect(deliveries).toHaveLength(36);
    expect(await Promise.all(deliveries.map((row) => Campaigns.processCampaignDelivery(row.id)))).toEqual(
      Array(36).fill('sent'),
    );
    expect(sendMail).toHaveBeenCalledTimes(36);
    for (const [mail] of vi.mocked(sendMail).mock.calls) {
      expect(mail.html).toContain('/api/wallet/email/');
    }
    for (const id of ids) expect((await campaignRow(id)).status).toBe('sent');
  });

  test('a recipient who opted out after dispatch is skipped', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    const target = (await deliveriesOf(id)).find((d) => d.userId === memberIds[3])!;
    await db
      .update(schema.marketingConsents)
      .set({ optedIn: false })
      .where(eq(schema.marketingConsents.userId, memberIds[3]));

    expect(await Campaigns.processCampaignDelivery(target.id)).toBe('skipped');
    expect(sendMail).not.toHaveBeenCalled();
    const [row] = await db.select().from(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.id, target.id));
    expect(row.status).toBe('skipped');
    expect(row.skipReason).toMatch(/Opted out/);

    await db
      .update(schema.marketingConsents)
      .set({ optedIn: true })
      .where(eq(schema.marketingConsents.userId, memberIds[3]));
  });

  test('stopping halts sending: remaining deliveries are skipped', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    const [first, ...rest] = await deliveriesOf(id);
    expect(await Campaigns.processCampaignDelivery(first.id)).toBe('sent');

    expect(await stopCampaign(id)).toEqual({ success: true, data: undefined });
    expect((await campaignRow(id)).status).toBe('cancelled');
    for (const d of rest) {
      expect(await Campaigns.processCampaignDelivery(d.id)).toBe('already_done');
    }
    expect(sendMail).toHaveBeenCalledTimes(1);
    const statuses = (await deliveriesOf(id)).map((d) => d.status).sort();
    expect(statuses.filter((s) => s === 'skipped')).toHaveLength(11);
  });

  test('a delivery queued when the campaign is cancelled is skipped', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    await db.update(schema.campaigns).set({ status: 'cancelled' }).where(eq(schema.campaigns.id, id));
    const [d] = await deliveriesOf(id);
    expect(await Campaigns.processCampaignDelivery(d.id)).toBe('skipped');
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('a retried or duplicated delivery is never sent twice', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    const [d] = await deliveriesOf(id);

    // Two copies of the same message racing, then a late redelivery.
    const results = await Promise.all([
      Campaigns.processCampaignDelivery(d.id),
      Campaigns.processCampaignDelivery(d.id),
    ]);
    expect(results.sort()).toEqual(['already_done', 'sent']);
    expect(await Campaigns.processCampaignDelivery(d.id)).toBe('already_done');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test('a consumer arriving during SMTP cannot claim the same delivery', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    const [delivery] = await deliveriesOf(id);
    let release!: () => void;
    let started!: () => void;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(sendMail).mockImplementationOnce(async () => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const first = Campaigns.processCampaignDelivery(delivery.id);
    await sending;
    try {
      expect(await Campaigns.processCampaignDelivery(delivery.id)).toBe('already_done');
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect((await campaignRow(id)).status).toBe('sending');
    } finally {
      release();
      expect(await first).toBe('sent');
    }
    expect((await deliveriesOf(id)).find((row) => row.id === delivery.id)).toMatchObject({
      attempts: 1,
      status: 'sent',
    });
  });

  test('Stop can finish while an in-progress delivery commits, without a deadlock', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    const [delivery] = await deliveriesOf(id);
    let release!: () => void;
    let started!: () => void;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(sendMail).mockImplementationOnce(async () => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const first = Campaigns.processCampaignDelivery(delivery.id);
    await sending;
    const stopping = stopCampaign(id);
    release();
    expect(await stopping).toMatchObject({ success: true });
    expect(await first).toBe('sent');
    const rows = await deliveriesOf(id);
    expect(rows.filter((row) => row.status === 'sent')).toHaveLength(1);
    expect(rows.filter((row) => row.status === 'skipped')).toHaveLength(11);
    expect((await campaignRow(id)).status).toBe('cancelled');
  });

  test('throttling is retried; suppression fails with a reason', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    const [throttled, suppressed] = await deliveriesOf(id);

    vi.mocked(sendMail).mockRejectedValueOnce(
      Object.assign(new Error('Throttling failure: Maximum sending rate exceeded.'), {
        responseCode: 454,
      }),
    );
    await expect(Campaigns.processCampaignDelivery(throttled.id)).rejects.toThrow(/Throttling/);
    let [row] = await db.select().from(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.id, throttled.id));
    expect(row).toMatchObject({ status: 'queued', attempts: 1 });
    expect(row.lastError).toMatch(/Throttling/);
    // The redelivery goes through.
    expect(await Campaigns.processCampaignDelivery(throttled.id)).toBe('sent');

    vi.mocked(sendMail).mockRejectedValueOnce(
      Object.assign(new Error('Message rejected'), {
        responseCode: 554,
        response: '554 Address is on the suppression list',
      }),
    );
    expect(await Campaigns.processCampaignDelivery(suppressed.id)).toBe('failed');
    [row] = await db.select().from(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.id, suppressed.id));
    expect(row.status).toBe('failed');
    expect(row.lastError).toMatch(/suppression list/);
  });

  test('gives up after the maximum attempts', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    const [d] = await deliveriesOf(id);
    // One attempt short of the limit of 8.
    await db.update(schema.campaignDeliveries).set({ attempts: 7 }).where(eq(schema.campaignDeliveries.id, d.id));
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('connection reset'));
    expect(await Campaigns.processCampaignDelivery(d.id)).toBe('failed');
  });

  test('a 5xx bounce fails at once; a connection error is retried', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    const [d] = await deliveriesOf(id);

    vi.mocked(sendMail).mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(Campaigns.processCampaignDelivery(d.id)).rejects.toThrow('ECONNRESET');
    let [row] = await db.select().from(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.id, d.id));
    expect(row).toMatchObject({ status: 'queued', attempts: 1 });

    vi.mocked(sendMail).mockRejectedValueOnce(
      Object.assign(new Error('Message rejected'), { responseCode: 550, response: '550 mailbox unavailable' }),
    );
    expect(await Campaigns.processCampaignDelivery(d.id)).toBe('failed');
    [row] = await db.select().from(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.id, d.id));
    expect(row).toMatchObject({ status: 'failed', attempts: 2 });
  });

  test('retry delay', () => {
    for (const n of [1, 3, 10]) {
      const ceiling = Math.min(300, 2 ** n * 5);
      expect(Campaigns.deliveryRetryDelay(n, () => 0)).toBe(Math.max(1, Math.round(ceiling / 2)));
      expect(Campaigns.deliveryRetryDelay(n, () => 1)).toBe(ceiling);
    }
  });
});

describe('send actions', () => {
  test('Send now queues the dispatch and leaves claiming to it', async () => {
    const id = await newCampaign({ status: 'draft', scheduledFor: null });
    const summary = await getSendSummary(id);
    expect(summary).toMatchObject({
      success: true,
      data: { recipients: 12, requiresTypedConfirmation: false, problems: [] },
    });

    expect(await sendCampaignNow(id)).toEqual({
      success: true,
      data: undefined,
    });
    const row = await campaignRow(id);
    expect(row.status).toBe('scheduled');
    expect(send).toHaveBeenCalledWith(
      'campaign-dispatch',
      { campaignId: id, scheduledFor: row.scheduledFor!.toISOString() },
      { idempotencyKey: `${id}:${row.scheduledFor!.toISOString()}` },
    );
    // Not a draft anymore.
    expect((await sendCampaignNow(id)).success).toBe(false);
  });

  test('Send now refuses a campaign with problems', async () => {
    const id = await newCampaign({
      status: 'draft',
      subject: '',
      scheduledFor: null,
    });
    expect(await sendCampaignNow(id)).toEqual({
      success: false,
      error: 'Add a subject line.',
    });
    expect(send).not.toHaveBeenCalled();
  });

  test('a failed publish puts the campaign back to draft', async () => {
    const id = await newCampaign({ status: 'draft', scheduledFor: null });
    send.mockRejectedValue(new Error('queue down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await sendCampaignNow(id)).success).toBe(false);
    expect((await campaignRow(id)).status).toBe('draft');
    vi.restoreAllMocks();
  });

  test('Retry failed requeues failed deliveries with a fresh idempotency key', async () => {
    const id = await newCampaign();
    await processCampaignDispatch(id);
    const deliveries = await deliveriesOf(id);
    for (const d of deliveries.slice(1)) await Campaigns.processCampaignDelivery(d.id);
    vi.mocked(sendMail).mockRejectedValueOnce(Object.assign(new Error('rejected'), { responseCode: 550 }));
    expect(await Campaigns.processCampaignDelivery(deliveries[0].id)).toBe('failed');
    expect((await campaignRow(id)).status).toBe('sent');

    send.mockClear();
    expect(await retryFailedDeliveries(id)).toEqual({
      success: true,
      data: { requeued: 1 },
    });
    expect((await campaignRow(id)).status).toBe('sending');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2].idempotencyKey).toBe(`${deliveries[0].id}:1`);

    expect(await Campaigns.processCampaignDelivery(deliveries[0].id)).toBe('sent');
    expect((await campaignRow(id)).status).toBe('sent');

    const results = await getCampaignResults(id);
    expect(results).toMatchObject({
      success: true,
      data: { counts: { queued: 0, sent: 12, failed: 0, skipped: 0 } },
    });
    expect(results.success && results.data!.recipients).toHaveLength(12);
  });

  test('retry publishing can recover even when no failed rows remain', async () => {
    const id = await newCampaign({ status: 'sent' });
    await db.insert(schema.campaignDeliveries).values({
      campaignId: id,
      userId: memberIds[0],
      email: 'pipeline-0@example.com',
      status: 'failed',
      attempts: 1,
    });
    send.mockRejectedValue(new Error('queue down'));
    expect((await retryFailedDeliveries(id)).success).toBe(false);
    expect((await deliveriesOf(id))[0].status).toBe('queued');
    send.mockReset();
    send.mockResolvedValue({ messageId: 'recovered' });
    expect(await retryFailedDeliveries(id)).toMatchObject({
      success: true,
      data: { requeued: 0 },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await Campaigns.processCampaignDelivery((await deliveriesOf(id))[0].id)).toBe('sent');
    expect((await campaignRow(id)).status).toBe('sent');
  });

  test('over 100 recipients, Send now needs the count typed back', async () => {
    const extra = await db
      .insert(schema.user)
      .values(
        Array.from({ length: 90 }, (_, i) => ({
          name: `Bulk ${i}`,
          email: `pipeline-bulk-${i}@example.com`,
          emailVerified: true,
        })),
      )
      .returning({ id: schema.user.id });
    const extraIds = extra.map((r) => r.id);
    try {
      await db.insert(schema.marketingConsents).values(extraIds.map((userId) => ({ userId, optedIn: true })));
      await insertAttendees(extraIds.map((userId) => ({ eventId, userId })));

      const id = await newCampaign({ status: 'draft', scheduledFor: null });
      expect(await getSendSummary(id)).toMatchObject({
        data: { recipients: 102, requiresTypedConfirmation: true },
      });
      expect(await sendCampaignNow(id)).toEqual({
        success: false,
        error: 'Type 102 to confirm sending to that many people.',
      });
      expect(await sendCampaignNow(id, 101)).toMatchObject({ success: false });
      expect(await sendCampaignNow(id, 102)).toEqual({
        success: true,
        data: undefined,
      });
    } finally {
      await db.delete(schema.user).where(inArray(schema.user.id, extraIds));
    }
  });
});
