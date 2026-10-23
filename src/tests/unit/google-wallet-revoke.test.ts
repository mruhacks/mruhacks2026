import { beforeEach, describe, expect, test, vi } from 'vitest';

const walletApiRequest = vi.fn();
vi.mock('@/lib/wallet/google/client', () => ({
  walletApiRequest: (...args: unknown[]) => walletApiRequest(...args),
}));

import { revokeGoogleWalletPasses } from '@/lib/wallet/google/event-ticket';

describe('revokeGoogleWalletPasses', () => {
  beforeEach(() => {
    walletApiRequest.mockReset().mockResolvedValue(null);
    vi.stubEnv('GOOGLE_WALLET_ISSUER_ID', '338');
    vi.stubEnv('GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL', 'wallet@example.com');
    vi.stubEnv('GOOGLE_WALLET_SERVICE_ACCOUNT_PRIVATE_KEY', 'unused');
  });

  test('replaces each ticket with an expired object that has no name or barcode', async () => {
    await revokeGoogleWalletPasses('u1', ['e1', 'e2']);

    expect(walletApiRequest).toHaveBeenCalledTimes(2);
    expect(walletApiRequest).toHaveBeenCalledWith('eventTicketObject/338.event-e1-user-u1', {
      method: 'PUT',
      body: {
        id: '338.event-e1-user-u1',
        classId: '338.event-e1',
        state: 'expired',
      },
    });
  });

  test('does nothing without Wallet credentials', async () => {
    vi.stubEnv('GOOGLE_WALLET_ISSUER_ID', '');
    await revokeGoogleWalletPasses('u1', ['e1']);
    expect(walletApiRequest).not.toHaveBeenCalled();
  });
});
