/**
 * Authentication configuration and utilities using Better Auth
 *
 * This module configures Better Auth with Drizzle adapter for PostgreSQL
 * and provides helpers for retrieving session and user information.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/utils/db";
import * as schema from "@/db/schema";
import { headers } from "next/headers";
import { cache } from "react";

/**
 * Better Auth instance configured with Drizzle ORM adapter
 *
 * Configuration:
 * - Database: PostgreSQL via Drizzle adapter
 * - Authentication method: Email and password
 * - ID generation: Handled by database (auto-increment/UUID)
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: { enabled: true },
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
  console.log("Get Session Call");
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
