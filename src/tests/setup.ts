import { afterAll, vi } from 'vitest';
import { db, client } from '@/utils/db';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────
// Mock next/navigation redirect
// ─────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

// ─────────────────────────────────────────────
// Run migrations once (top-level await so __DB_TEST_READY__ is set before test files load)
// ─────────────────────────────────────────────
const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

try {
  await migrate(db, { migrationsFolder });
  console.log('✅ Test database migrated successfully.');

  await db.execute(sql`
    TRUNCATE TABLE
      authz.user_role,
      authz.user_permission,
      authz.role_permission,
      authz.role,
      authz.permission,
      "user"
    RESTART IDENTITY CASCADE;
  `);

  (
    globalThis as {
      __DB_TEST_READY__?: boolean;
    }
  ).__DB_TEST_READY__ = true;
} catch (e) {
  console.warn(
    '⚠️ Test database unavailable; DB-backed tests (e.g. authz) will be skipped:',
    e,
  );
  (
    globalThis as {
      __DB_TEST_READY__?: boolean;
    }
  ).__DB_TEST_READY__ = false;
}

// ─────────────────────────────────────────────
// Gracefully close the DB connection
// ─────────────────────────────────────────────
afterAll(async () => {
  await client.end();
});
