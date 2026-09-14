import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Deliberately non-UTC, and deliberately not EVENT_TIME_ZONE
    // (America/Edmonton) either: a formatter that dropped its timeZone arg
    // and fell back to the ambient zone would render identically under
    // America/Edmonton and go undetected. Asia/Kolkata's half-hour offset
    // also catches bugs a whole-hour mismatch would hide. See AGENTS.md.
    env: { TZ: 'Asia/Kolkata' },
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
    setupFiles: ['./src/tests/setup.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/tests/**',
        'src/**/*.d.ts',
        // React components, pages, layouts — require browser/renderer
        'src/**/*.tsx',
        // DB schema definitions — pure Drizzle table declarations, nothing to test
        'src/db/**',
        // TypeScript type-only files
        'src/types/**',
        // Static content constants
        'src/content.ts',
        // Next.js proxy/middleware — edge runtime, not unit-testable
        'src/proxy.ts',
        // Zod/validation schemas — declarative, no logic
        'src/**/schemas.ts',
        // Better-auth client config
        'src/utils/auth-client.ts',
        // Next.js API route handlers (thin auth adapter wrappers)
        'src/app/api/**',
      ],
    },
  },
});
