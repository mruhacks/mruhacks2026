import { beforeAll, afterAll, vi } from 'vitest';
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
  // Mirror real unstable_rethrow: re-throw redirect errors so they escape
  // try/catch blocks in actions, matching production control-flow behaviour.
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }
  }),
}));
vi.mock('server-only', () => ({}));

// `after()` throws outside a Next request scope. `sendMagicLink` schedules
// its cooldown cleanup through it on a random ~10% of sends, which made any
// test sending a magic link fail intermittently. Its work is best-effort
// cleanup, so dropping it in tests is fine.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));

// ─────────────────────────────────────────────
// Run migrations once before all tests
// ─────────────────────────────────────────────
beforeAll(async () => {
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

  try {
    await migrate(db, {
      migrationsFolder,
      // Must match `migrations` in drizzle.config.ts. The CLI
      // (`drizzle-kit migrate`, used by db:seed/db:reset and CI) records
      // applied migrations in drizzle.journal; drizzle-orm's default here
      // would be drizzle.__drizzle_migrations. Two ledgers over one folder
      // means whichever path runs second re-applies every migration the
      // first already did and fails on the first ADD COLUMN.
      migrationsTable: 'journal',
      migrationsSchema: 'drizzle',
    });
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
  await client.end();
});
