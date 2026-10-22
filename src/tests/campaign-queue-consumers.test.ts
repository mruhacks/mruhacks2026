import { beforeAll, describe, expect, test, vi } from 'vitest';

type Metadata = { deliveryCount: number; messageId: string };
type Handler = (message: unknown, metadata: Metadata) => Promise<void>;
type Retry = (error: unknown, metadata: Metadata) => { afterSeconds: number };

const { handlers, retries, processCampaignDispatch, processCampaignDelivery } =
  vi.hoisted(() => ({
    handlers: [] as Handler[],
    retries: [] as (Retry | undefined)[],
    processCampaignDispatch: vi.fn(),
    processCampaignDelivery: vi.fn(),
  }));

vi.mock('@vercel/queue', () => ({
  handleCallback: (handler: Handler, options?: { retry?: Retry }) => {
    handlers.push(handler);
    retries.push(options?.retry);
    return handler;
  },
}));
vi.mock('@/lib/campaigns/process-dispatch', () => ({
  processCampaignDispatch,
}));
vi.mock('@/lib/campaigns/process-delivery', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/campaigns/process-delivery')
  >()),
  processCampaignDelivery,
}));

beforeAll(async () => {
  await import('@/app/api/queues/campaign-dispatch/route');
  await import('@/app/api/queues/campaign-deliveries/route');
});

const meta = (deliveryCount: number) => ({ deliveryCount, messageId: 'm' });

describe('campaign queue consumers', () => {
  test('dispatch hands the campaign id to processCampaignDispatch', async () => {
    processCampaignDispatch.mockResolvedValue({ kind: 'dispatched' });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await handlers[0](
      { campaignId: 'c1', scheduledFor: '2026-10-21T12:00:00Z' },
      meta(1),
    );
    expect(processCampaignDispatch).toHaveBeenCalledWith(
      'c1',
      '2026-10-21T12:00:00Z',
    );
  });

  test('deliveries hand the delivery id over, and a thrown error propagates for retry', async () => {
    processCampaignDelivery.mockResolvedValueOnce('sent');
    await handlers[1]({ deliveryId: 'd1' }, meta(1));
    expect(processCampaignDelivery).toHaveBeenCalledWith('d1');

    processCampaignDelivery.mockRejectedValueOnce(new Error('throttled'));
    await expect(handlers[1]({ deliveryId: 'd1' }, meta(2))).rejects.toThrow(
      'throttled',
    );
  });

  test('delivery retries back off with jitter, capped at 5 minutes', () => {
    const retry = retries[1]!;
    for (let n = 1; n <= 12; n++) {
      const { afterSeconds } = retry(new Error('x'), meta(n));
      const ceiling = Math.min(300, 2 ** n * 5);
      expect(afterSeconds).toBeGreaterThanOrEqual(Math.floor(ceiling / 2));
      expect(afterSeconds).toBeLessThanOrEqual(ceiling);
    }
  });
});
