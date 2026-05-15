/**
 * Authentication configuration and utilities using Better Auth
 *
 * This module configures Better Auth with Drizzle adapter for PostgreSQL
 * and provides helpers for retrieving session and user information.
 */

import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import { sendMail } from '@/utils/mail';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

/** OTP codes expire after this many seconds (10 minutes). */
const EMAIL_OTP_EXPIRES_IN = 600;

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
  plugins: [
    emailOTP({
      expiresIn: EMAIL_OTP_EXPIRES_IN,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === 'email-verification') {
          void sendMail({
            to: email,
            subject: 'Your verification code — MRU Hacks',
            text: `Your verification code is: ${otp}\n\nIt expires in 10 minutes.\n`,
            html: `<p>Your verification code is: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p>`,
          }).catch((err) => {
            console.error('[auth] sendVerificationOTP failed', err);
          });
        }
      },
    }),
  ],
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
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

export type OnboardingState =
  | { step: 'unauthenticated' }
  | { step: 'unverified'; userId: string; email: string }
  | { step: 'needs-profile'; userId: string; name: string }
  | { step: 'complete'; userId: string };

/**
 * Single source of truth for where a user is in the onboarding funnel.
 * Pure data function -- never redirects. Cached per request.
 */
export const getOnboardingState = cache(
  async (): Promise<OnboardingState> => {
    const session = await getSession();
    if (!session) return { step: 'unauthenticated' };
    if (!session.user.emailVerified) {
      return {
        step: 'unverified',
        userId: session.user.id,
        email: session.user.email,
      };
    }

    const { getUserProfile } = await import(
      '@/app/dashboard/profile/actions'
    );
    const profile = await getUserProfile();
    if (!profile.success || profile.data == null) {
      return {
        step: 'needs-profile',
        userId: session.user.id,
        name: session.user.name,
      };
    }
    return { step: 'complete', userId: session.user.id };
  },
);

/**
 * Redirects the user to the appropriate page for their onboarding state.
 * Call from layouts/pages after checking the state.
 */
export function redirectToOnboardingStep(state: OnboardingState): never {
  switch (state.step) {
    case 'unauthenticated':
      redirect('/signin');
    case 'unverified':
    case 'needs-profile':
      redirect('/onboarding');
    case 'complete':
      redirect('/dashboard');
  }
}
