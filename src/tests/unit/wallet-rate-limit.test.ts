import { describe, it, expect } from 'vitest';
import * as Wallet from '@/lib/wallet/server';

describe('checkWalletRateLimit', () => {
  it('allows requests under the limit', async () => {
    const userId = crypto.randomUUID();
    for (let i = 0; i < 10; i++) {
      expect(await Wallet.checkWalletRateLimit(userId)).toBe(true);
    }
  });

  it('rejects once a user exceeds the limit', async () => {
    const userId = crypto.randomUUID();
    for (let i = 0; i < 10; i++) {
      await Wallet.checkWalletRateLimit(userId);
    }
    expect(await Wallet.checkWalletRateLimit(userId)).toBe(false);
  });

  it('tracks each user independently', async () => {
    const exhausted = crypto.randomUUID();
    for (let i = 0; i < 10; i++) {
      await Wallet.checkWalletRateLimit(exhausted);
    }
    expect(await Wallet.checkWalletRateLimit(exhausted)).toBe(false);

    const fresh = crypto.randomUUID();
    expect(await Wallet.checkWalletRateLimit(fresh)).toBe(true);
  });
});
