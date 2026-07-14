/**
 * Authentication configuration and utilities using Better Auth
 *
 * This module configures Better Auth with Drizzle adapter for PostgreSQL
 * and provides helpers for retrieving session and user information.
 */

import { betterAuth } from 'better-auth';
import { admin, magicLink } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { resolveMagicLinkMailOptions } from '@/lib/auth/resolve-magic-link-email';
import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import { sendMail } from '@/utils/mail';
import { headers } from 'next/headers';
import { cache } from 'react';
import { writeAuditLog } from '@/utils/audit-log';

/** Verification links expire after this many seconds (24 hours). */
const EMAIL_VERIFICATION_EXPIRES_IN = 86400;

/**
 * Magic-link token lifetime (seconds).
 *
 * Trade-off: RSVP `respondBy` may be days later, but a long-lived auth token is
 * risky for general sign-in (same plugin setting). 24h matches email
 * verification and covers "open the email soon after it arrives." If the link
 * expires before `respondBy`, a resend-link flow is required (not in this
 * change).
 */
const MAGIC_LINK_EXPIRES_IN = 86400;

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
    throw new Error(
      'BETTER_AUTH_SECRET or AUTH_SECRET is required for Better Auth',
    );
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
  rateLimit: {
    storage: 'database',
    customRules: {
      '/send-verification-email': { window: 300, max: 3 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          const impersonatedBy = session.impersonatedBy;
          if (typeof impersonatedBy === 'string') {
            await writeAuditLog({
              actorId: impersonatedBy,
              action: 'user.impersonated',
              targetType: 'user',
              targetId: session.userId,
            });
          }
        },
      },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    expiresIn: EMAIL_VERIFICATION_EXPIRES_IN,
    sendVerificationEmail: async ({ user, url }) => {
      void sendMail({
        to: user.email,
        subject: 'Verify your email — MRUHacks',
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
        subject: 'Reset your password — MRUHacks',
        text: `Reset your password by opening this link:\n\n${url}\n`,
        html: `<p>Reset your password by clicking <a href="${url}">this link</a>.</p>`,
      }).catch((err) => {
        console.error('[auth] sendResetPassword failed', err);
      });
    },
  },
  user: {
    /**
     * Self-serve account deletion (right to erasure — PIPEDA / Alberta PIPA /
     * GDPR Art. 17). Deletion is confirmed via an emailed verification link so
     * it cannot be triggered by a hijacked session. Once verified, Better Auth
     * removes the user row; every user-scoped table cascades via its
     * `onDelete: 'cascade'` foreign key, so no residual personal data remains.
     */
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async ({ user, url }) => {
        void sendMail({
          to: user.email,
          subject: 'Confirm account deletion — MRUHacks',
          text:
            `We received a request to permanently delete your MRUHacks account.\n\n` +
            `Confirm by opening this link (valid for 24 hours):\n\n${url}\n\n` +
            `This erases your account and all associated data and cannot be undone. ` +
            `If you did not request this, you can safely ignore this email.\n`,
          html:
            `<p>We received a request to permanently delete your MRUHacks account.</p>` +
            `<p>Confirm by clicking <a href="${url}">this link</a> (valid for 24 hours).</p>` +
            `<p>This erases your account and all associated data and <strong>cannot be undone</strong>. ` +
            `If you did not request this, you can safely ignore this email.</p>`,
        }).catch((err) => {
          console.error('[auth] sendDeleteAccountVerification failed', err);
        });
      },
    },
  },
  socialProviders: {
    ...(process.env.GITHUB_CLIENT_ID && {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    }),
  },
  plugins: [
    admin(),
    magicLink({
      /**
       * Not set to `disableSignUp: true`: admin `inviteUser` relies on magic
       * links to create accounts for new invitees. RSVP waves only email
       * existing approved applicants (joined from `user`), so they never
       * create accounts via this path.
       */
      expiresIn: MAGIC_LINK_EXPIRES_IN,
      sendMagicLink: async ({ email, url }) => {
        // Routes by callbackURL `source` (e.g. rsvp → RSVP invitation email).
        const mail = await resolveMagicLinkMailOptions({
          email,
          magicLinkUrl: url,
        });
        await sendMail(mail);
      },
    }),
  ],
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
const getSession = cache(async () => {
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
