/**
 * Signed unsubscribe links: MailHog integration for the headers and footer,
 * and the GET-never-unsubscribes / POST-does rule.
 * Requires MailHog: pnpm services:start
 */
import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import * as Campaigns from '@/lib/campaigns/server';
import { sendMail } from '@/utils/mail';
import { decodeMimeWords, waitForEmail } from '@/utils/mailhog';
import { GET, POST } from '@/app/api/unsubscribe/route';

const ts = Date.now();
const EMAIL = `unsub-${ts}@example.com`;
let userId: string;
const savedEnv = {
  APP_SIGNING_PRIVATE_KEY: process.env.APP_SIGNING_PRIVATE_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
};

const content = (type: Campaigns.Content['type']): Campaigns.Content => ({
  type,
  subject: `Unsub ${type} ${ts}`,
  previewText: '',
  bodyMarkdown: 'Hello {{firstName}}',
  eventName: type === 'operational' ? 'MRUHacks 2026' : null,
});

async function optedIn(): Promise<boolean | undefined> {
  const [row] = await db
    .select({ optedIn: schema.marketingConsents.optedIn })
    .from(schema.marketingConsents)
    .where(eq(schema.marketingConsents.userId, userId));
  return row?.optedIn;
}

/**
 * Headers straight from the raw message, unfolded. MailHog's own parsed
 * headers drop a folded header, and a long List-Unsubscribe URL is folded.
 */
function rawHeaders(raw: string): Map<string, string> {
  const head = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
  const headers = new Map<string, string>();
  for (const line of head.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers.set(line.slice(0, i).toLowerCase(), line.slice(i + 1).trim());
  }
  return headers;
}

function tokenOf(url: string): string {
  return new URL(url).searchParams.get('t')!;
}

beforeAll(async () => {
  const { privateKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  process.env.APP_SIGNING_PRIVATE_KEY = privateKey as unknown as string;
  process.env.EMAIL_FROM = 'MRUHacks <noreply@localhost>';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';

  const [row] = await db
    .insert(schema.user)
    .values({ name: 'Unsub Person', email: EMAIL, emailVerified: true })
    .returning({ id: schema.user.id });
  userId = row.id;
  await db.insert(schema.marketingConsents).values({ userId, optedIn: true });
});

afterAll(async () => {
  await db.delete(schema.user).where(eq(schema.user.id, userId));
  await db.delete(schema.signingPublicKeys);
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('campaign email unsubscribe headers (MailHog)', () => {
  test('marketing email carries List-Unsubscribe, List-Unsubscribe-Post and the footer link', async () => {
    await sendMail(
      await Campaigns.buildCampaignMessage(content('marketing'), {
        email: EMAIL,
        firstName: 'Unsub',
      }),
    );
    const msg = await waitForEmail(
      (m) => decodeMimeWords(m.Content.Headers.Subject?.[0] ?? '') === `Unsub marketing ${ts}`,
    );
    const headers = rawHeaders(msg.Raw.Data);
    expect(headers.get('list-unsubscribe')).toMatch(/^<http:\/\/localhost:3000\/api\/unsubscribe\?t=[A-Za-z0-9_-]+>$/);
    expect(headers.get('list-unsubscribe-post')).toBe('List-Unsubscribe=One-Click');
    const raw = msg.Raw.Data.replace(/=\r?\n/g, '');
    expect(raw).toContain('localhost:3000/unsubscribe?t=');
  });

  test('operational email carries neither', async () => {
    await sendMail(
      await Campaigns.buildCampaignMessage(content('operational'), {
        email: EMAIL,
        firstName: 'Unsub',
      }),
    );
    const msg = await waitForEmail(
      (m) => decodeMimeWords(m.Content.Headers.Subject?.[0] ?? '') === `Unsub operational ${ts}`,
    );
    const headers = rawHeaders(msg.Raw.Data);
    expect(headers.has('list-unsubscribe')).toBe(false);
    expect(headers.has('list-unsubscribe-post')).toBe(false);
    expect(msg.Raw.Data).not.toContain('unsubscribe?t=');
  });
});

describe('unsubscribing', () => {
  test('opening the link (GET) changes nothing; the one-click POST unsubscribes', async () => {
    await db.update(schema.marketingConsents).set({ optedIn: true }).where(eq(schema.marketingConsents.userId, userId));
    const { oneClick } = await Campaigns.unsubscribeUrls(EMAIL);

    const get = GET(new Request(oneClick));
    expect(get.status).toBe(303);
    expect(get.headers.get('location')).toContain('/unsubscribe?t=');
    expect(await optedIn()).toBe(true);

    const post = await POST(
      new Request(oneClick, {
        method: 'POST',
        body: 'List-Unsubscribe=One-Click',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    );
    expect(post.status).toBe(200);
    expect(await optedIn()).toBe(false);

    // Idempotent.
    expect((await POST(new Request(oneClick, { method: 'POST' }))).status).toBe(200);
    expect(await optedIn()).toBe(false);
  });

  test('the page button unsubscribes; a tampered token does not', async () => {
    await db.update(schema.marketingConsents).set({ optedIn: true }).where(eq(schema.marketingConsents.userId, userId));
    const { page } = await Campaigns.unsubscribeUrls(EMAIL);
    const token = tokenOf(page);

    expect(await Campaigns.unsubscribeByToken(`${token.slice(0, -2)}AA`)).toBe('invalid');
    expect(await optedIn()).toBe(true);

    expect(await Campaigns.unsubscribeByToken(token)).toBe('unsubscribed');
    expect(await optedIn()).toBe(false);
  });

  test('an address with no account gets a friendly outcome', async () => {
    const { page } = await Campaigns.unsubscribeUrls(`nobody-${ts}@example.com`);
    expect(await Campaigns.unsubscribeByToken(tokenOf(page))).toBe('no_account');
  });

  test('a user with no consent row ends up opted out', async () => {
    await db.delete(schema.marketingConsents).where(eq(schema.marketingConsents.userId, userId));
    const { page } = await Campaigns.unsubscribeUrls(EMAIL.toUpperCase());
    expect(await Campaigns.unsubscribeByToken(tokenOf(page))).toBe('unsubscribed');
    expect(await optedIn()).toBe(false);
  });

  test('an invalid token is a 400 for one-click', async () => {
    const response = await POST(
      new Request('http://localhost/api/unsubscribe?t=nope', {
        method: 'POST',
      }),
    );
    expect(response.status).toBe(400);
  });
});
