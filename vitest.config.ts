import { defineConfig } from 'vitest/config';

const alias = { '@': new URL('./src', import.meta.url).pathname };

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/tests/unit/**/*.test.ts'],
          alias,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/tests/*.test.ts'],
          setupFiles: ['./src/tests/setup.ts'],
          alias,
        },
      },
    ],
  },
});
