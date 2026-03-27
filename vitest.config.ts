import { defineConfig } from 'vitest/config';

const alias = {
  '@': new URL('./src', import.meta.url).pathname,
};

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    environment: 'node',
    alias,
  },
});
