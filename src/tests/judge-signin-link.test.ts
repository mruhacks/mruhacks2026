/**
 * `createJudgeSignInLink` against the real Better Auth magic-link plugin: the
 * link comes back to the caller instead of being emailed, and is short-lived.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import { verification } from '@/db/schema';

vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { sendMail } from '@/utils/mail';
import { createJudgeSignInLink, sendJudgeInvite } from '@/lib/judging/judge-invite';
import { JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS } from '@/lib/judging/signin-qr';
import { EMAIL_LINK_CONFIRM_PATH } from '@/lib/auth/email-link-confirm-url';
import { MAGIC_LINK_EXPIRES_IN_SECONDS } from '@/utils/auth';

const email = `judge-signin-link-${Date.now()}@example.com`;
const tokens: string[] = [];

async function expiresInSeconds(token: string): Promise<number> {
  const [row] = await db
    .select({ expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, token))
    .limit(1);
  if (!row) throw new Error('verification row missing');
  return (row.expiresAt.getTime() - Date.now()) / 1000;
}

beforeAll(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
});

beforeEach(() => {
  vi.mocked(sendMail).mockClear();
});

afterAll(async () => {
  for (const token of tokens) {
    await db.delete(verification).where(eq(verification.identifier, token));
  }
});

describe('createJudgeSignInLink', () => {
  test('returns a short-lived confirm-page link and sends no email', async () => {
    const url = new URL(await createJudgeSignInLink(email));
    const token = url.searchParams.get('token');
    expect(token).toBeTruthy();
    tokens.push(token!);

    expect(sendMail).not.toHaveBeenCalled();
    expect(url.pathname).toBe(EMAIL_LINK_CONFIRM_PATH);
    expect(url.searchParams.get('link')).toBe('magic-link');
    expect(url.searchParams.get('callbackURL')).toBe('/dashboard');

    const remaining = await expiresInSeconds(token!);
    expect(remaining).toBeLessThanOrEqual(JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS);
    expect(remaining).toBeGreaterThan(JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS - 60);
  });

  test('leaves the emailed invite and its lifetime alone', async () => {
    await sendJudgeInvite({ email, eventName: 'Signin Link Event' });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const token = vi.mocked(sendMail).mock.calls[0][0].text?.match(/token=([A-Za-z]+)/)?.[1];
    expect(token).toBeTruthy();
    tokens.push(token!);
    expect(await expiresInSeconds(token!)).toBeGreaterThan(MAGIC_LINK_EXPIRES_IN_SECONDS - 60);
  });
});
