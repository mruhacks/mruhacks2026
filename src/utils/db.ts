import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { Pool } from "pg";

const isProduction = false && process.env.NODE_ENV === "production";

const isDef = (v: unknown): v is undefined | null =>
  v === undefined || v === null;

function buildPostgresURL(): string | undefined {
  const env = process.env;
  const required = [
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
  ] as const;

  // if any required var is undefined/null/empty, bail
  for (const key of required) {
    const value = env[key];
    if (isDef(value) || value === "") return undefined;
  }

  const host = env.POSTGRES_HOST ?? "localhost";
  const port = env.POSTGRES_PORT ?? "5432";

  return `postgres://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@${host}:${port}/${env.POSTGRES_DB}`;
}

export function getDatabaseURL(): string {
  const c = buildPostgresURL();
  const e = process.env.DATABASE_URL;

  const cDef = !isDef(c);
  const eDef = !isDef(e);

  // XOR → exactly one defined
  if (cDef !== eDef) return c ?? e!;

  // both defined and equal → fine
  if (cDef && eDef && c === e) return c;

  // both defined but not equal → conflict
  if (c && e)
    throw new Error(
      [
        "Conflicting database URLs detected:",
        `  Constructed: ${c}`,
        `  Explicit:    ${e}`,
      ].join("\n"),
    );

  // neither defined
  throw new Error("No database configuration found.");
}

const pool = new Pool({
  connectionString: getDatabaseURL(),
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });

export default db;
