import { configDefaults, defineConfig } from 'vitest/config';

import base from './vitest.config.mts';
import { GAVEL_DIFFERENTIAL_TEST } from './vitest.shared.mts';

/** Just the Gavel differential test, which `pnpm test` leaves out. */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [GAVEL_DIFFERENTIAL_TEST],
    exclude: configDefaults.exclude,
  },
});
