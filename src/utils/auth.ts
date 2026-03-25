/**
 * Authentication configuration and utilities using Better Auth
 *
 * This module configures Better Auth with Drizzle adapter for PostgreSQL
 * and provides helpers for retrieving session and user information.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import { sendMail } from '@/utils/mail';
import { headers } from 'next/headers';
import { cache } from 'react';

/** Verification links expire after this many seconds (24 hours). */
const EMAIL_VERIFICATION_EXPIRES_IN = 86400;

function getAuthBaseUrl(): string {
  const v = process.env.BETTER_AUTH_URL?.trim();
  if (!v) {
    throw new Error('BETTER_AUTH_URL is required for Better Auth');
  }
  return v;
}

function getAuthSecret(): string {
  const v = (process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET)?.trim();
  if (!v) {
    throw new Error('BETTER_AUTH_SECRET or AUTH_SECRET is required for Better Auth');
  }
  return v;
}

/**
 * Better Auth instance configured with Drizzle ORM adapter
 *
 * Configuration:
 * - Database: PostgreSQL via Drizzle adapter
 * - Authentication method: Email and password
 * - ID generation: Handled by database (auto-increment/UUID)
 */
export const auth = betterAuth({
  baseURL: getAuthBaseUrl(),
  secret: getAuthSecret(),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    expiresIn: EMAIL_VERIFICATION_EXPIRES_IN,
    sendVerificationEmail: async ({ user, url }) => {
      void sendMail({
        to: user.email,
        subject: 'Verify your email — MRU Hacks',
        text: `Verify your email address by opening this link:\n\n${url}\n`,
        html: `<p>Verify your email address by clicking <a href="${url}">this link</a>.</p>`,
      }).catch((err) => {
        console.error('[auth] sendVerificationEmail failed', err);
      });
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      void sendMail({
        to: user.email,
        subject: 'Reset your password — MRU Hacks',
        text: `Reset your password by opening this link:\n\n${url}\n`,
        html: `<p>Reset your password by clicking <a href="${url}">this link</a>.</p>`,
      }).catch((err) => {
        console.error('[auth] sendResetPassword failed', err);
      });
    },
  },
  advanced: {
    database: {
      generateId: false,
    },
  },
});

/**
 * Retrieves the current session from the request headers
 *
 * This function is cached using React's cache() to avoid redundant
 * database queries within the same render cycle.
 *
 * @returns Promise resolving to the current session or null if not authenticated
 */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session;
});

/**
 * Retrieves the currently authenticated user
 *
 * @returns Promise resolving to the user object or null if not authenticated
 */
export async function getUser() {
  return (await getSession())?.user || null;
}
