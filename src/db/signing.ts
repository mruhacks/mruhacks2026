/**
 * Public halves of every app signing key that has signed an email token.
 *
 * Links in sent email (unsubscribe, wallet) never expire, so they must keep
 * verifying after the private key is rotated. Rather than carrying old keys
 * in extra env vars, the current public key is recorded here whenever an
 * email token is signed, and verification falls back to every stored key that
 * isn't revoked. Revoking a key is setting `revoked_at`. Public keys aren't
 * secret; the private key itself is only ever read from the env.
 */

import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const signingPublicKeys = pgTable('signing_public_keys', {
  id: serial('id').primaryKey(),
  /** SPKI PEM, as produced by `publicKeyToPem`. */
  publicKey: text('public_key').notNull().unique(),
  firstUsedAt: timestamp('first_used_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
