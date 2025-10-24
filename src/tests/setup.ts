import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { db, pool } from "@/utils/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────
// Mock next/navigation redirect
// ─────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

// ─────────────────────────────────────────────
// Run migrations once before all tests
// ─────────────────────────────────────────────
beforeAll(async () => {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");

  try {
    await migrate(db, { migrationsFolder });
    console.log("✅ Test database migrated successfully.");
  } catch (e) {
    console.error("❌ Migration failed in test setup:", e);
    process.exit(1);
  }

  // Ensure tables start clean
  await db.execute(sql`
    TRUNCATE TABLE
      user_role,
      user_permission,
      role_permission,
      role,
      permission,
      "user"
    RESTART IDENTITY CASCADE;
  `);
});

// ─────────────────────────────────────────────
// Optional: Clean tables between tests
// ─────────────────────────────────────────────
afterEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE
      user_role,
      user_permission,
      role_permission,
      role,
      permission,
      "user"
    RESTART IDENTITY CASCADE;
  `);
});

// ─────────────────────────────────────────────
// Gracefully close the DB connection
// ─────────────────────────────────────────────
afterAll(async () => {
  await pool.end();
});
