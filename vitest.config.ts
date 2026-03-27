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
          include: [
            'src/tests/mail.test.ts',
            'src/tests/sanitize-internal-next.test.ts',
            'src/tests/post-auth-redirect.test.ts',
            'src/tests/register-actions.test.ts',
          ],
          setupFiles: ['./src/tests/setup-env.ts'],
          environment: 'node',
          alias,
        },
      },
      {
        test: {
          name: 'proxy',
          globals: true,
          include: ['src/tests/proxy.test.ts'],
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
          exclude: [
            'src/tests/mail.test.ts',
            'src/tests/proxy.test.ts',
            'src/tests/sanitize-internal-next.test.ts',
            'src/tests/post-auth-redirect.test.ts',
            'src/tests/register-actions.test.ts',
          ],
          setupFiles: ['./src/tests/setup-env.ts', './src/tests/setup.ts'],
          environment: 'node',
          alias,
        },
      },
    ],
  },
});
