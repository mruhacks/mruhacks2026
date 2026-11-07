import 'server-only';

import { eq } from 'drizzle-orm';
import { generateRandomString } from 'better-auth/crypto';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';

import { EMAIL_LINK_CONFIRM_PATH, EMAIL_LINK_KIND_PARAM } from './email-link-confirm-url';

/** How long a magic link lasts when its sender doesn't say otherwise. */
export const DEFAULT_MAGIC_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Stored the way Better Auth's own magic-link plugin did, so links emailed
 * before we replaced it keep working until they expire, and account deletion
 * can still find an address's live links by `value`.
 */
const identifierFor = (token: string) => `magic-link:${token}`;

type MagicLinkRecord = { type: 'magic-link'; email: string };

/** `BETTER_AUTH_URL`: the origin magic links (and the emails carrying them) point at. */
export function getBaseUrl(): string {
  const v = process.env.BETTER_AUTH_URL?.trim();
  if (!v) throw new Error('BETTER_AUTH_URL is required to build magic links');
  return v;
}

/**
 * Mints a single-use sign-in link for `email` and returns it; sending it is
 * the caller's job. Following it signs in the account with that email, or
 * creates one (verified, since only the mailbox owner could have clicked it).
 *
 * The link points at the confirm page, not the verify endpoint: corporate
 * link scanners GET every URL in an email, and a GET there would spend the
 * token. See `toEmailLinkConfirmUrl`.
 */
export async function createMagicLink(options: {
  email: string;
  /** Same-origin path to land on once signed in. */
  callbackURL: string;
  expiresAt?: Date;
}): Promise<{ url: string; expiresAt: Date }> {
  const token = generateRandomString(32, 'a-z', 'A-Z');
  const expiresAt = options.expiresAt ?? new Date(Date.now() + DEFAULT_MAGIC_LINK_LIFETIME_MS);
  const record: MagicLinkRecord = { type: 'magic-link', email: options.email.trim().toLowerCase() };

  await db.insert(schema.verification).values({
    identifier: identifierFor(token),
    value: JSON.stringify(record),
    expiresAt,
  });

  const url = new URL(EMAIL_LINK_CONFIRM_PATH, getBaseUrl());
  url.searchParams.set(EMAIL_LINK_KIND_PARAM, 'magic-link');
  url.searchParams.set('token', token);
  url.searchParams.set('callbackURL', options.callbackURL);
  return { url: url.toString(), expiresAt };
}

/**
 * Spends a magic-link token and returns the email it was minted for, or null
 * when it's unknown, already used or expired. The delete is the claim, so two
 * concurrent clicks can't both sign in.
 */
export async function consumeMagicLink(token: string): Promise<string | null> {
  const rows = await db
    .delete(schema.verification)
    .where(eq(schema.verification.identifier, identifierFor(token)))
    .returning({ value: schema.verification.value, expiresAt: schema.verification.expiresAt });

  const live = rows.find((row) => row.expiresAt > new Date());
  if (!live) return null;
  try {
    const record = JSON.parse(live.value) as Partial<MagicLinkRecord>;
    return record.type === 'magic-link' && typeof record.email === 'string' ? record.email : null;
  } catch {
    return null;
  }
}
