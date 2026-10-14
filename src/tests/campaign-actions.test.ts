/**
 * Campaign server actions: authorization, draft creation and the audience
 * builder's count / preview.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  campaigns,
  events,
  marketingConsents,
  permission,
  user,
  userPermission,
} from '@/db/schema';
import { insertAttendees } from '@/tests/participation-fixtures';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  updateTag: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import { sendMail } from '@/utils/mail';
import {
  countAudienceForBuilder,
  createCampaign,
  previewAudienceForBuilder,
  previewCampaignEmail,
  sendCampaignTest,
  updateCampaignAudience,
  updateCampaignContent,
  uploadCampaignImage,
} from '@/app/dashboard/admin/campaigns/actions';

const FORBIDDEN = /REDIRECT:\/forbidden/;
const userIds: Record<string, string> = {};
let eventId: string;
let subeventId: string;
const createdCampaigns: string[] = [];

async function grant(userId: string, slugs: string[]) {
  for (const slug of slugs) {
    const [row] = await db
      .insert(permission)
      .values({ slug })
      .onConflictDoUpdate({ target: permission.slug, set: { slug } })
      .returning({ id: permission.id });
    await db
      .insert(userPermission)
      .values({ userId, permissionId: row.id })
      .onConflictDoNothing();
  }
}

function actAs(name: string) {
  vi.mocked(getUser).mockResolvedValue({
    id: userIds[name],
  } as Awaited<ReturnType<typeof getUser>>);
}

beforeAll(async () => {
  // Test sends sign an unsubscribe link.
  process.env.APP_SIGNING_PRIVATE_KEY = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey as unknown as string;
  for (const name of ['writer', 'previewer', 'operator', 'reader', 'member']) {
    const [row] = await db
      .insert(user)
      .values({
        name: `Campaign action ${name}`,
        email: `campaign-action-${name}@example.com`,
        emailVerified: true,
      })
      .returning({ id: user.id });
    userIds[name] = row.id;
  }
  await grant(userIds.writer, ['campaign:write:all', 'campaign:read:all']);
  await grant(userIds.previewer, [
    'campaign:write:all',
    'participant:read:all',
  ]);
  await grant(userIds.operator, [
    'campaign:write:all',
    'campaign:operational:all',
  ]);
  await grant(userIds.reader, ['campaign:read:all']);

  const [event] = await db
    .insert(events)
    .values({ name: 'Campaign actions event' })
    .returning({ id: events.id });
  eventId = event.id;
  const [sub] = await db
    .insert(events)
    .values({ name: 'Campaign actions lunch', parentEventId: eventId })
    .returning({ id: events.id });
  subeventId = sub.id;
  await insertAttendees({ eventId, userId: userIds.member });
  await db
    .insert(marketingConsents)
    .values({ userId: userIds.member, optedIn: true });
});

beforeEach(() => vi.mocked(getUser).mockReset());

afterAll(async () => {
  await db.delete(campaigns).where(inArray(campaigns.id, createdCampaigns));
  await db.delete(events).where(inArray(events.id, [subeventId, eventId]));
  await db.delete(user).where(inArray(user.id, Object.values(userIds)));
});

const audienceForEvent = () => ({
  context: { type: 'operational' as const, eventId },
  rules: {
    combinator: 'and' as const,
    rules: [
      {
        field: 'participatedIn' as const,
        operator: '=' as const,
        value: { eventId, statuses: ['accepted' as const] },
      },
    ],
  },
});

describe('createCampaign', () => {
  test('creates a marketing draft with an empty inline audience', async () => {
    actAs('writer');
    const result = await createCampaign({
      name: 'Spring newsletter',
      type: 'marketing',
      eventId: null,
    });
    expect(result.success).toBe(true);
    const id = result.success ? result.data!.id : '';
    createdCampaigns.push(id);
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(row).toMatchObject({
      status: 'draft',
      type: 'marketing',
      audienceRules: { combinator: 'and', rules: [] },
      savedAudienceId: null,
      createdBy: userIds.writer,
      updatedBy: userIds.writer,
    });
  });

  test('operational needs campaign:operational:all', async () => {
    actAs('writer');
    await expect(
      createCampaign({ name: 'Logistics', type: 'operational', eventId }),
    ).rejects.toThrow(FORBIDDEN);
  });

  test('operational needs a top-level event', async () => {
    actAs('operator');
    expect(
      await createCampaign({ name: 'X', type: 'operational', eventId: null }),
    ).toEqual({ success: false, error: 'Operational email needs an event.' });
    const sub = await createCampaign({
      name: 'X',
      type: 'operational',
      eventId: subeventId,
    });
    expect(sub.success).toBe(false);

    const ok = await createCampaign({
      name: 'Logistics',
      type: 'operational',
      eventId,
    });
    expect(ok.success).toBe(true);
    if (ok.success) createdCampaigns.push(ok.data!.id);
  });

  test('read-only holders cannot create', async () => {
    actAs('reader');
    await expect(
      createCampaign({ name: 'Nope', type: 'marketing', eventId: null }),
    ).rejects.toThrow(FORBIDDEN);
  });
});

describe('updateCampaignAudience', () => {
  test('saves valid rules to a draft and rejects invalid ones', async () => {
    actAs('writer');
    const created = await createCampaign({
      name: 'Audience edit',
      type: 'marketing',
      eventId: null,
    });
    const id = created.success ? created.data!.id : '';
    createdCampaigns.push(id);

    const rules = {
      combinator: 'or' as const,
      rules: [
        {
          field: 'onTeam' as const,
          operator: '!=' as const,
          value: { eventId },
        },
      ],
    };
    expect(await updateCampaignAudience(id, rules)).toEqual({
      success: true,
      data: undefined,
    });
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(row.audienceRules).toEqual(rules);

    const bad = await updateCampaignAudience(id, {
      combinator: 'and',
      rules: [{ field: 'sql', operator: '=', value: {} }],
    } as never);
    expect(bad.success).toBe(false);

    await db
      .update(campaigns)
      .set({ status: 'sent' })
      .where(eq(campaigns.id, id));
    expect(await updateCampaignAudience(id, rules)).toMatchObject({
      success: false,
      error: expect.stringMatching(/Only drafts/),
    });
  });
});

describe('audience builder count and preview', () => {
  test('count needs only campaign:write:all', async () => {
    actAs('writer');
    expect(await countAudienceForBuilder(audienceForEvent())).toEqual({
      success: true,
      data: 1,
    });
  });

  test('count is refused without campaign:write:all', async () => {
    actAs('reader');
    await expect(countAudienceForBuilder(audienceForEvent())).rejects.toThrow(
      FORBIDDEN,
    );
  });

  test('preview is refused without participant:read:all', async () => {
    actAs('writer');
    expect(await previewAudienceForBuilder(audienceForEvent())).toEqual({
      success: false,
      error: "You don't have permission to see recipients.",
    });
  });

  test('preview lists recipients with participant:read:all', async () => {
    actAs('previewer');
    const result = await previewAudienceForBuilder(audienceForEvent());
    expect(result).toEqual({
      success: true,
      data: [
        {
          id: userIds.member,
          name: 'Campaign action member',
          email: 'campaign-action-member@example.com',
        },
      ],
    });
  });

  test('marketing context forces the opt-in filter', async () => {
    actAs('writer');
    await db
      .update(marketingConsents)
      .set({ optedIn: false })
      .where(eq(marketingConsents.userId, userIds.member));
    const result = await countAudienceForBuilder({
      ...audienceForEvent(),
      context: { type: 'marketing', eventId: null },
    });
    expect(result).toEqual({ success: true, data: 0 });
    await db
      .update(marketingConsents)
      .set({ optedIn: true })
      .where(eq(marketingConsents.userId, userIds.member));
  });

  test('operational context without an event is rejected', async () => {
    actAs('writer');
    const result = await countAudienceForBuilder({
      ...audienceForEvent(),
      context: { type: 'operational', eventId: null },
    });
    expect(result.success).toBe(false);
  });
});

describe('campaign content', () => {
  async function draft(): Promise<string> {
    actAs('writer');
    const created = await createCampaign({
      name: 'Content test',
      type: 'marketing',
      eventId: null,
    });
    const id = created.success ? created.data!.id : '';
    createdCampaigns.push(id);
    return id;
  }

  test('saves content and refuses unknown merge fields', async () => {
    const id = await draft();
    const saved = await updateCampaignContent(id, {
      name: 'Renamed',
      subject: 'Hi {{firstName}}',
      previewText: '',
      bodyMarkdown: 'Hello {{firstName|friend}}',
    });
    expect(saved.success).toBe(true);
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(row).toMatchObject({
      name: 'Renamed',
      subject: 'Hi {{firstName}}',
      bodyMarkdown: 'Hello {{firstName|friend}}',
    });

    const refused = await updateCampaignContent(id, {
      name: 'Renamed',
      subject: 'Hi {{lastName}}',
      previewText: '',
      bodyMarkdown: '',
    });
    expect(refused).toMatchObject({
      success: false,
      error: expect.stringContaining('{{lastName}}'),
    });
  });

  test('send test goes only to the signed-in user, and matches the preview', async () => {
    const id = await draft();
    await updateCampaignContent(id, {
      name: 'Test send',
      subject: 'Hi {{firstName}}',
      previewText: 'Preview',
      bodyMarkdown: '# Hello {{firstName}}\n\n<script>alert(1)</script>',
    });
    vi.mocked(getUser).mockResolvedValue({
      id: userIds.writer,
      name: 'Campaign action writer',
      email: 'campaign-action-writer@example.com',
    } as Awaited<ReturnType<typeof getUser>>);

    vi.mocked(sendMail).mockClear();
    const result = await sendCampaignTest(id);
    expect(result).toEqual({
      success: true,
      data: { to: 'campaign-action-writer@example.com' },
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendMail).mock.calls[0][0];
    expect(mail.to).toBe('campaign-action-writer@example.com');
    expect(mail.subject).toBe('[Test] Hi Campaign');
    expect(mail.html).not.toContain('<script');

    const preview = await previewCampaignEmail(id, {
      subject: 'Hi {{firstName}}',
      previewText: 'Preview',
      bodyMarkdown: '# Hello {{firstName}}\n\n<script>alert(1)</script>',
    });
    // Identical apart from the footer link: a preview has no signed token.
    const unlink = (html: string) =>
      html.replace(
        /href="[^"]*(unsubscribe\?t=|dashboard\/account)[^"]*"/g,
        'href=""',
      );
    expect(mail.html).toContain('/unsubscribe?t=');
    expect(mail.listUnsubscribeUrl).toMatch(/\/api\/unsubscribe\?t=/);
    expect(unlink(preview.success ? preview.data!.html : '')).toBe(
      unlink(mail.html!),
    );
  });

  test('send test refuses an empty subject', async () => {
    const id = await draft();
    vi.mocked(getUser).mockResolvedValue({
      id: userIds.writer,
      name: 'W',
      email: 'campaign-action-writer@example.com',
    } as Awaited<ReturnType<typeof getUser>>);
    expect(await sendCampaignTest(id)).toEqual({
      success: false,
      error: 'Add a subject line.',
    });
  });
});

describe('uploadCampaignImage', () => {
  test('optimizes and stores an upload, returning its stable URL', async () => {
    actAs('writer');
    const png = await (
      await import('sharp')
    )
      .default({
        create: {
          width: 2000,
          height: 1000,
          channels: 3,
          background: { r: 1, g: 2, b: 3 },
        },
      })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append(
      'file',
      new File([new Uint8Array(png)], 'x.png', { type: 'image/png' }),
    );
    const result = await uploadCampaignImage(form);
    expect(result).toMatchObject({
      success: true,
      data: {
        url: expect.stringMatching(
          /^\/api\/assets\/campaign-content\/[0-9a-f-]{36}-w1200\.jpg$/,
        ),
      },
    });
  });

  test('refuses SVG, oversize files, and non-writers', async () => {
    actAs('writer');
    const svg = new FormData();
    svg.append(
      'file',
      new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }),
    );
    expect((await uploadCampaignImage(svg)).success).toBe(false);

    const big = new FormData();
    big.append(
      'file',
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'x.jpg', {
        type: 'image/jpeg',
      }),
    );
    expect(await uploadCampaignImage(big)).toEqual({
      success: false,
      error: 'Images must be smaller than 5 MB.',
    });

    actAs('reader');
    await expect(uploadCampaignImage(svg)).rejects.toThrow(FORBIDDEN);
  });
});

describe('wallet block on save', () => {
  test('is refused without an event that has check-in on', async () => {
    actAs('writer');
    const created = await createCampaign({
      name: 'Wallet no event',
      type: 'marketing',
      eventId: null,
    });
    const id = created.success ? created.data!.id : '';
    createdCampaigns.push(id);
    expect(
      await updateCampaignContent(id, {
        name: 'Wallet no event',
        subject: 'S',
        previewText: '',
        bodyMarkdown: 'Hi\n\n::wallet',
      }),
    ).toMatchObject({
      success: false,
      error: expect.stringMatching(/wallet block/),
    });
  });
});
