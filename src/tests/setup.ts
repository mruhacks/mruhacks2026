import { beforeAll, afterAll, vi } from 'vitest';
import { db, pool } from '@/utils/db';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
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
// Run migrations once before all tests
// ─────────────────────────────────────────────
beforeAll(async () => {
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

  try {
    await migrate(db, { migrationsFolder });
    console.log('✅ Test database migrated successfully.');
  } catch (e) {
    console.error('❌ Migration failed in test setup:', e);
    process.exit(1);
  }

  // Ensure tables start clean
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
});

// ─────────────────────────────────────────────
// Gracefully close the DB connection
// ─────────────────────────────────────────────
afterAll(async () => {
  await pool.end();
});
