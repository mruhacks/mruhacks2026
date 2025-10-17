/**
 * Unified Database configuration module (Drizzle + Postgres)
 *
 * This version ensures:
 * - All environments (test, dev, prod) share the same configuration niceties.
 * - Test environment can use TEST_DATABASE_URL *or* granular TEST_POSTGRES_* vars.
 * - Migrations auto-run in test mode to keep schema up-to-date.
 * - SSL and pool behavior identical to production unless overridden.
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { Pool } from "pg";

/** Environment flags */
const env = process.env;
const isTest = env.NODE_ENV === "test";
const isProduction = env.NODE_ENV === "production";

/**
 * Type guard for undefined/null
 */
const isNil = (v: unknown): v is undefined | null =>
  v === undefined || v === null;

/**
 * Builds a PostgreSQL URL from either the normal or test prefix set.
 *
 * @param prefix "POSTGRES" or "TEST_POSTGRES"
 */
function buildPostgresURL(
  prefix: "POSTGRES" | "TEST_POSTGRES",
): string | undefined {
  const u = env[`${prefix}_USER`];
  const p = env[`${prefix}_PASSWORD`];
  const d = env[`${prefix}_DB`];

  if (isNil(u) || isNil(p) || isNil(d) || u === "" || p === "" || d === "") {
    return undefined;
  }

  const host = env[`${prefix}_HOST`] ?? "localhost";
  const port = env[`${prefix}_PORT`] ?? "5432";

  return `postgres://${u}:${p}@${host}:${port}/${d}`;
}

/**
 * Resolves the active database connection URL, supporting:
 *  - TEST_DATABASE_URL
 *  - TEST_POSTGRES_* vars
 *  - DATABASE_URL
 *  - POSTGRES_* vars
 */
export function getDatabaseURL(): string {
  const prefix = isTest ? "TEST_POSTGRES" : "POSTGRES";

  const constructed = buildPostgresURL(prefix);
  const explicit = isTest ? env.TEST_DATABASE_URL : env.DATABASE_URL;

  const cDef = !isNil(constructed);
  const eDef = !isNil(explicit);

  if (cDef !== eDef) return constructed ?? explicit!;
  if (cDef && eDef && constructed === explicit) return constructed!;
  if (constructed && explicit && constructed !== explicit)
    throw new Error(
      [
        "Conflicting database URLs detected:",
        `  Constructed: ${constructed}`,
        `  Explicit:    ${explicit}`,
      ].join("\n"),
    );

  throw new Error("No database configuration found.");
}

/**
 * Creates the PostgreSQL connection pool with SSL parity.
 */
const connectionString = getDatabaseURL();

export const pool = new Pool({
  connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema, casing: "snake_case" });

export default db;

// 👇 Only for testing, no runtime impact
if (process.env.NODE_ENV === "test") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__db_internals__ = {
    isNil,
    buildPostgresURL,
    getDatabaseURL,
  };
}
