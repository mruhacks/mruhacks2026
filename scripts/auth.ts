/**
 * Minimal version of the auth setup for the seeder, since the main one pulls
 * in too much
 */

import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/utils/db';
import * as schema from '@/db/schema';

function getAuthBaseUrl(): string {
  const v = process.env.BETTER_AUTH_URL?.trim();
  if (!v) throw new Error('BETTER_AUTH_URL is required for Better Auth');
  return v;
}

function getAuthSecret(): string {
  const v = (process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET)?.trim();
  if (!v)
    throw new Error(
      'BETTER_AUTH_SECRET or AUTH_SECRET is required for Better Auth',
    );
  return v;
}

export const auth = betterAuth({
  baseURL: getAuthBaseUrl(),
  secret: getAuthSecret(),
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailVerification: { sendVerificationEmail: async () => {} },
  emailAndPassword: { enabled: true },
  plugins: [admin()],
  advanced: { database: { generateId: false } },
});
