/**
 * Database connection and configuration module
 * 
 * This module handles PostgreSQL database connection using Drizzle ORM.
 * It supports flexible database URL configuration through either:
 * 1. Individual environment variables (POSTGRES_USER, POSTGRES_PASSWORD, etc.)
 * 2. A complete DATABASE_URL connection string
 * 
 * The module validates that configurations don't conflict and ensures
 * exactly one valid configuration is provided.
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { Pool } from "pg";

/**
 * Flag to determine if SSL should be enabled for the database connection
 * Currently hardcoded to false, but can be enabled in production
 */
const isProduction = false && process.env.NODE_ENV === "production";

/**
 * Type guard to check if a value is undefined or null
 * @param v - The value to check
 * @returns True if the value is undefined or null
 */
const isDef = (v: unknown): v is undefined | null =>
  v === undefined || v === null;

/**
 * Constructs a PostgreSQL connection URL from individual environment variables
 * 
 * Required environment variables:
 * - POSTGRES_USER: Database username
 * - POSTGRES_PASSWORD: Database password
 * - POSTGRES_DB: Database name
 * 
 * Optional environment variables (with defaults):
 * - POSTGRES_HOST: Database host (default: "localhost")
 * - POSTGRES_PORT: Database port (default: "5432")
 * 
 * @returns The constructed PostgreSQL URL or undefined if required variables are missing
 */
function buildPostgresURL(): string | undefined {
  const env = process.env;
  const required = [
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
  ] as const;

  // Check if any required variable is undefined, null, or empty
  for (const key of required) {
    const value = env[key];
    if (isDef(value) || value === "") return undefined;
  }

  const host = env.POSTGRES_HOST ?? "localhost";
  const port = env.POSTGRES_PORT ?? "5432";

  return `postgres://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@${host}:${port}/${env.POSTGRES_DB}`;
}

/**
 * Retrieves and validates the database connection URL
 * 
 * This function handles three scenarios:
 * 1. Exactly one method (constructed or explicit) is defined → returns that URL
 * 2. Both methods are defined and equal → returns the URL (they're the same)
 * 3. Both methods are defined but differ → throws an error (conflict)
 * 4. Neither method is defined → throws an error (no configuration)
 * 
 * @returns The validated database connection URL
 * @throws Error if configurations conflict or no configuration is found
 */
export function getDatabaseURL(): string {
  const c = buildPostgresURL();
  const e = process.env.DATABASE_URL;

  const cDef = !isDef(c);
  const eDef = !isDef(e);

  // XOR → exactly one defined
  if (cDef !== eDef) return c ?? e!;

  // Both defined and equal → fine
  if (cDef && eDef && c === e) return c;

  // Both defined but not equal → conflict
  if (c && e)
    throw new Error(
      [
        "Conflicting database URLs detected:",
        `  Constructed: ${c}`,
        `  Explicit:    ${e}`,
      ].join("\n"),
    );

  // Neither defined
  throw new Error("No database configuration found.");
}

/**
 * PostgreSQL connection pool instance
 * Configured with the validated database URL and optional SSL settings
 */
const pool = new Pool({
  connectionString: getDatabaseURL(),
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

/**
 * Drizzle ORM database instance
 * Used throughout the application for type-safe database queries
 */
export const db = drizzle(pool, { schema });

export default db;
