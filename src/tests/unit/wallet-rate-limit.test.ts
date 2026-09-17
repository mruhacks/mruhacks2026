import { describe, it, expect } from 'vitest';
import { checkWalletRateLimit } from '@/lib/wallet/rate-limit';

describe('checkWalletRateLimit', () => {
  it('allows requests under the limit', async () => {
    const userId = crypto.randomUUID();
    for (let i = 0; i < 10; i++) {
      expect(await checkWalletRateLimit(userId)).toBe(true);
    }
  });

  it('rejects once a user exceeds the limit', async () => {
    const userId = crypto.randomUUID();
    for (let i = 0; i < 10; i++) {
      await checkWalletRateLimit(userId);
    }
    expect(await checkWalletRateLimit(userId)).toBe(false);
  });

  it('tracks each user independently', async () => {
    const exhausted = crypto.randomUUID();
    for (let i = 0; i < 10; i++) {
      await checkWalletRateLimit(exhausted);
    }
    expect(await checkWalletRateLimit(exhausted)).toBe(false);

    const fresh = crypto.randomUUID();
    expect(await checkWalletRateLimit(fresh)).toBe(true);
  });
});
