import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';

type Metadata = { deliveryCount: number; messageId: string };
type RetryHandler = (
  error: unknown,
  metadata: Metadata,
) => { afterSeconds: number } | { acknowledge: true } | undefined;
type Handler = (
  message: { responseId: string },
  metadata: Metadata,
) => Promise<void>;

let capturedHandler: Handler | undefined;
let capturedRetry: RetryHandler | undefined;

const handleCallback = vi.fn(
  (handler: Handler, options?: { retry?: RetryHandler }) => {
    capturedHandler = handler;
    capturedRetry = options?.retry;
    return handler;
  },
);

vi.mock('@vercel/queue', () => ({ handleCallback }));

const processRsvpInvitation = vi.fn();
vi.mock('@/lib/rsvp/process-rsvp-invitation', () => ({
  processRsvpInvitation,
}));

beforeAll(async () => {
  await import('@/app/api/queues/rsvp-invitation/route');
});

beforeEach(() => {
  processRsvpInvitation.mockReset();
  processRsvpInvitation.mockResolvedValue('sent');
});

describe('POST /api/queues/rsvp-invitation', () => {
  test('registers a handler via handleCallback', () => {
    expect(handleCallback).toHaveBeenCalledTimes(1);
  });

  test('calls processRsvpInvitation with the response id and delivery count', async () => {
    await capturedHandler!(
      { responseId: 'response-1' },
      { deliveryCount: 3, messageId: 'msg-1' },
    );
    expect(processRsvpInvitation).toHaveBeenCalledWith('response-1', 3);
  });

  test('propagates a processing failure so the queue retries the message', async () => {
    processRsvpInvitation.mockRejectedValueOnce(new Error('smtp down'));

    await expect(
      capturedHandler!(
        { responseId: 'response-2' },
        { deliveryCount: 1, messageId: 'msg-2' },
      ),
    ).rejects.toThrow('smtp down');
  });

  test('retry callback only computes backoff timing from metadata, no DB access', () => {
    expect(capturedRetry).toBeTypeOf('function');
    const directive = capturedRetry!(new Error('boom'), {
      deliveryCount: 2,
      messageId: 'msg-3',
    });
    expect(directive).toEqual({ afterSeconds: expect.any(Number) });
  });
});
