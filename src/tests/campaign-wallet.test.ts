import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import * as Signing from '@/lib/signing/server';
import * as Campaigns from '@/lib/campaigns/server';
import { insertAttendees, setStatus } from '@/tests/participation-fixtures';

// Pass signing and Google's API need real credentials; here we only care
// whether the route decides to hand one out.
const generateParticipantPass = vi.fn();
vi.mock('@/lib/wallet/generate-pass', () => ({
  generateParticipantPass: (...args: unknown[]) => generateParticipantPass(...args),
}));
vi.mock('@/lib/wallet/google/event-ticket', () => ({
  buildGoogleWalletSaveUrl: vi.fn().mockResolvedValue('https://pay.google.com/gp/v/save/abc'),
}));

import { GET } from '@/app/api/wallet/email/[token]/route';

const BASE = 'https://app.example.com';
let userId: string;
let eventId: string;
let endedEventId: string;
let noCheckInEventId: string;
const savedKey = process.env.APP_SIGNING_PRIVATE_KEY;

function call(token: string, platform: string) {
  return GET(new Request(`${BASE}/api/wallet/email/${token}?platform=${platform}`), {
    params: Promise.resolve({ token }),
  });
}

beforeAll(async () => {
  process.env.APP_SIGNING_PRIVATE_KEY = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey as unknown as string;
  generateParticipantPass.mockResolvedValue(Buffer.from('pkpass'));

  const [u] = await db
    .insert(schema.user)
    .values({
      name: 'Wallet Person',
      email: 'campaign-wallet@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  userId = u.id;
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const [e] = await db
    .insert(schema.events)
    .values({ name: 'Wallet event', endsAt: future })
    .returning({ id: schema.events.id });
  const [ended] = await db
    .insert(schema.events)
    .values({ name: 'Ended event', endsAt: new Date(Date.now() - 3600_000) })
    .returning({ id: schema.events.id });
  const [noCheckIn] = await db
    .insert(schema.events)
    .values({ name: 'No check-in', checkInEnabled: false })
    .returning({ id: schema.events.id });
  eventId = e.id;
  endedEventId = ended.id;
  noCheckInEventId = noCheckIn.id;
  await insertAttendees([
    { eventId, userId },
    { eventId: endedEventId, userId },
  ]);
});

afterAll(async () => {
  await db.delete(schema.events).where(inArray(schema.events.id, [eventId, endedEventId, noCheckInEventId]));
  await db.delete(schema.user).where(eq(schema.user.id, userId));
  await db.delete(schema.signingPublicKeys);
  if (savedKey === undefined) delete process.env.APP_SIGNING_PRIVATE_KEY;
  else process.env.APP_SIGNING_PRIVATE_KEY = savedKey;
});

describe('/api/wallet/email/[token]', () => {
  test('an accepted participant gets the pass with no login; after declining the same link 404s', async () => {
    const token = await Signing.buildWalletLinkToken(userId, eventId);

    const apple = await call(token, 'apple');
    expect(apple.status).toBe(200);
    expect(apple.headers.get('content-type')).toBe('application/vnd.apple.pkpass');
    expect(generateParticipantPass).toHaveBeenCalledWith(
      expect.objectContaining({ eventId, userId, name: 'Wallet Person' }),
    );

    const google = await call(token, 'google');
    expect(google.status).toBe(302);
    expect(google.headers.get('location')).toBe('https://pay.google.com/gp/v/save/abc');

    await setStatus(eventId, userId, 'declined');
    expect((await call(token, 'apple')).status).toBe(404);
    await setStatus(eventId, userId, 'accepted');
  });

  test('an ended event, a bad platform or a forged token is a 404', async () => {
    const ended = await Signing.buildWalletLinkToken(userId, endedEventId);
    expect((await call(ended, 'apple')).status).toBe(404);

    const token = await Signing.buildWalletLinkToken(userId, eventId);
    expect((await call(token, 'samsung')).status).toBe(404);
    const forged = await Signing.buildWalletLinkToken('00000000-0000-0000-0000-000000000000', eventId);
    expect((await call(`${forged.slice(0, -3)}AAA`, 'apple')).status).toBe(404);
  });
});

describe('wallet block', () => {
  test('only allowed for an event with check-in on', async () => {
    expect(await Campaigns.walletBlockError(null)).toMatch(/check-in/);
    expect(await Campaigns.walletBlockError(noCheckInEventId)).toMatch(/check-in/);
    expect(await Campaigns.walletBlockError(eventId)).toBeNull();
  });

  test('links only for recipients holding a spot in an event that has not ended', async () => {
    const links = await Campaigns.walletLinksFor(userId, eventId, BASE);
    expect(links?.apple).toMatch(/^https:\/\/app\.example\.com\/api\/wallet\/email\/[A-Za-z0-9_-]+\?platform=apple$/);
    expect(await Campaigns.walletLinksFor(userId, endedEventId, BASE)).toBeNull();
    await setStatus(eventId, userId, 'waitlisted');
    expect(await Campaigns.walletLinksFor(userId, eventId, BASE)).toBeNull();
    await setStatus(eventId, userId, 'accepted');
  });

  test('renders badges with links, or nothing without them', async () => {
    const content = {
      type: 'operational' as const,
      subject: 'S',
      previewText: '',
      bodyMarkdown: 'Before\n\n::wallet\n\nAfter',
      eventName: 'Wallet event',
    };
    const links = {
      apple: `${BASE}/api/wallet/email/t?platform=apple`,
      google: `${BASE}/api/wallet/email/t?platform=google`,
    };
    const withLinks = await Campaigns.renderCampaignEmail(
      content,
      { firstName: null },
      { baseUrl: BASE, blocks: Campaigns.walletBlockRenderers(links, BASE) },
    );
    expect(withLinks.html).toContain(links.apple.replace(/&/g, '&amp;'));
    expect(withLinks.html).toContain(`${BASE}/wallet/add-to-apple-wallet.png`);
    expect(withLinks.text).toContain(`Add to Google Wallet: ${links.google}`);

    const without = await Campaigns.renderCampaignEmail(
      content,
      { firstName: null },
      { baseUrl: BASE, blocks: Campaigns.walletBlockRenderers(null, BASE) },
    );
    expect(without.html).not.toContain('add-to-apple-wallet');
    expect(without.text).not.toContain('Wallet:');
    expect(without.html).toContain('After');
  });
});
