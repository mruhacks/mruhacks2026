/**
 * Authentication configuration and utilities using Better Auth
 *
 * This module configures Better Auth with Drizzle adapter for PostgreSQL
 * and provides helpers for retrieving session and user information.
 */

import { betterAuth, APIError } from 'better-auth';
import { admin, captcha, magicLink } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq, lt, sql } from 'drizzle-orm';
import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import { sendMail } from '@/utils/mail';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { cache } from 'react';
import { writeAuditLog } from '@/utils/audit-log';
import { deleteObject, parseProfilePictureKey } from '@/utils/object-storage';

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
    throw new Error(
      'BETTER_AUTH_SECRET or AUTH_SECRET is required for Better Auth',
    );
  }
  return v;
}

function getTurnstileSecretKey(): string {
  const v = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!v) {
    throw new Error('TURNSTILE_SECRET_KEY is required for Better Auth');
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
      // Credential brute-forcing
      '/sign-in/email': { window: 600, max: 10 },
      // Mass account creation
      '/sign-up/email': { window: 3600, max: 5 },
      // Email-sending endpoints — capped to stop spam/enumeration abuse
      '/send-verification-email': { window: 300, max: 3 },
      '/sign-in/magic-link': { window: 300, max: 3 },
      '/request-password-reset': { window: 300, max: 3 },
      '/delete-user': { window: 300, max: 3 },
      // Sensitive account mutations
      '/change-password': { window: 300, max: 5 },
      '/change-email': { window: 300, max: 3 },
      '/reset-password': { window: 300, max: 5 },
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
     * `onDelete: 'cascade'` foreign key, so no residual personal data remains
     * in the database — but object storage (resume, profile picture) is
     * outside the DB and cascades don't reach it, so `beforeDelete` removes
     * those objects explicitly while the row can still be queried.
     */
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        const [profile] = await db
          .select({ resumeFile: schema.userProfiles.resumeFile })
          .from(schema.userProfiles)
          .where(eq(schema.userProfiles.userId, user.id))
          .limit(1);

        const pictureKey = parseProfilePictureKey(user.image);
        await Promise.all([
          pictureKey ? deleteObject(pictureKey) : Promise.resolve(),
          profile?.resumeFile
            ? deleteObject(profile.resumeFile)
            : Promise.resolve(),
        ]).catch((error) => {
          console.error('[auth] failed to delete user object storage files', error);
        });
      },
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
      sendMagicLink: async ({ email, url }) => {
        // De-dup: skip sending if we already emailed this address within the
        // last 60s (double submit, multiple tabs, retries). Better Auth has
        // already minted the verification token by this point, so the
        // caller still sees a normal success response either way.
        const [allowed] = await db
          .insert(schema.magicLinkCooldown)
          .values({ email })
          .onConflictDoUpdate({
            target: schema.magicLinkCooldown.email,
            set: { lastSentAt: new Date() },
            where: lt(
              schema.magicLinkCooldown.lastSentAt,
              sql`now() - interval '60 seconds'`,
            ),
          })
          .returning();
        if (!allowed) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message:
              'A sign-in link was already sent to this address. Check your inbox, or try again in a minute.',
          });
        }

        // Self-cleaning: occasionally piggyback on a send to prune rows
        // whose cooldown has already lapsed, so the table doesn't grow
        // forever without needing a separate cron job. Probabilistic so a
        // burst of sends doesn't turn into a burst of cleanup deletes.
        if (Math.random() < 0.1) {
          after(async () => {
            await db
              .delete(schema.magicLinkCooldown)
              .where(
                lt(
                  schema.magicLinkCooldown.lastSentAt,
                  sql`now() - interval '60 seconds'`,
                ),
              );
          });
        }

        void sendMail({
          to: email,
          subject: 'Sign in to MRUHacks',
          text: `Sign in by opening this link:\n\n${url}\n`,
          html: `<p>Sign in by clicking <a href="${url}">this link</a>.</p>`,
        }).catch((err) => {
          console.error('[auth] sendMagicLink failed', err);
        });
      },
    }),
    // Bot protection on the endpoints a public form can trigger. The client
    // sends the widget token via the `x-captcha-response` header (see
    // src/components/turnstile.tsx).
    captcha({
      provider: 'cloudflare-turnstile',
      secretKey: getTurnstileSecretKey(),
      endpoints: [
        '/sign-up/email',
        '/sign-in/email',
        '/sign-in/magic-link',
        '/request-password-reset',
      ],
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
