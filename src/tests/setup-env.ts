/**
 * Runs before other setup files. ESM hoists imports, so env for Better Auth must be
 * set here — not after `import '@/utils/db'` in setup.ts — or @/utils/auth will throw.
 */
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
if (
  !process.env.BETTER_AUTH_SECRET?.trim() &&
  !process.env.AUTH_SECRET?.trim()
) {
  process.env.BETTER_AUTH_SECRET =
    'vitest-test-secret-at-least-32-characters-long';
}
