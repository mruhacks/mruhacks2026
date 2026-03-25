import { defineConfig } from 'vitest/config';

const alias = {
  '@': new URL('./src', import.meta.url).pathname,
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'mail',
          globals: true,
          include: ['src/tests/mail.test.ts'],
          setupFiles: [],
          environment: 'node',
          alias,
        },
      },
      {
        test: {
          name: 'default',
          globals: true,
          include: ['src/**/*.test.ts'],
          exclude: ['src/tests/mail.test.ts'],
          setupFiles: ['./src/tests/setup.ts'],
          environment: 'node',
          alias,
        },
      },
    ],
  },
});
