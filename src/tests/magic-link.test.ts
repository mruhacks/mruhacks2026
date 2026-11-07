/**
 * Our magic-link sign-in end to end: a link minted by `createMagicLink`, spent
 * through the real `/magic-link/verify` endpoint.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';

vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from '@/utils/auth';
import * as Auth from '@/lib/auth/server';

const stamp = Date.now();
const emails: string[] = [];

function freshEmail(label: string): string {
  const email = `magic-link-${label}-${stamp}@example.com`;
  emails.push(email);
  return email;
}

async function mint(email: string, expiresAt?: Date): Promise<string> {
  const { url } = await Auth.createMagicLink({ email, callbackURL: '/dashboard', expiresAt });
  return new URL(url).searchParams.get('token')!;
}

async function verify(token: string): Promise<Response> {
  return auth.api.magicLinkVerify({
    query: { token, callbackURL: '/dashboard' },
    headers: new Headers({ origin: 'http://localhost:3000' }),
    asResponse: true,
  });
}

beforeAll(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
});

afterAll(async () => {
  await db.delete(schema.user).where(inArray(schema.user.email, emails));
});

describe('magic-link sign-in', () => {
  test('points the link at the confirm page', async () => {
    const { url, expiresAt } = await Auth.createMagicLink({ email: freshEmail('url'), callbackURL: '/welcome' });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(Auth.EMAIL_LINK_CONFIRM_PATH);
    expect(parsed.searchParams.get(Auth.EMAIL_LINK_KIND_PARAM)).toBe('magic-link');
    expect(parsed.searchParams.get('callbackURL')).toBe('/welcome');
    expect(Math.abs(expiresAt.getTime() - (Date.now() + Auth.DEFAULT_MAGIC_LINK_LIFETIME_MS))).toBeLessThan(5000);
  });

  test('creates a verified account, signs it in, and works only once', async () => {
    const email = freshEmail('new');
    const token = await mint(email);

    const first = await verify(token);
    expect(first.status).toBe(302);
    expect(first.headers.get('location')).toBe('http://localhost:3000/dashboard');
    expect(first.headers.get('set-cookie')).toContain('session_token');

    const [user] = await db.select().from(schema.user).where(eq(schema.user.email, email));
    expect(user.emailVerified).toBe(true);

    const second = await verify(token);
    expect(second.status).toBe(302);
    expect(second.headers.get('location')).toContain(`${Auth.MAGIC_LINK_ERROR_CALLBACK_URL}&error=INVALID_TOKEN`);
  });

  test('rejects an expired link', async () => {
    const token = await mint(freshEmail('expired'), new Date(Date.now() - 1000));
    const res = await verify(token);
    expect(res.headers.get('location')).toContain('error=INVALID_TOKEN');
  });

  test('strips logins an unverified account picked up before the owner proved the address', async () => {
    const email = freshEmail('unverified');
    const [user] = await db
      .insert(schema.user)
      .values({ name: 'Squatter', email, emailVerified: false })
      .returning({ id: schema.user.id });
    await db
      .insert(schema.account)
      .values({ userId: user.id, accountId: user.id, providerId: 'credential', password: 'x' });

    const res = await verify(await mint(email));
    expect(res.status).toBe(302);
    expect(res.headers.get('set-cookie')).toContain('session_token');

    const [after] = await db.select().from(schema.user).where(eq(schema.user.id, user.id));
    expect(after.emailVerified).toBe(true);
    expect(await db.select().from(schema.account).where(eq(schema.account.userId, user.id))).toHaveLength(0);
    // The session just created survives the cleanup.
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, user.id))).toHaveLength(1);
  });
});
