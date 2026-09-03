import { describe, test, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();

vi.mock('@vercel/queue', () => ({
  send,
}));

describe('publishRsvpInvitation', () => {
  beforeEach(() => {
    send.mockReset();
  });

  test('publishes to the rsvp-invitations topic with the response id as both payload and idempotency key', async () => {
    send.mockResolvedValue({ messageId: 'msg-123' });

    const { publishRsvpInvitation, RSVP_INVITATION_QUEUE_TOPIC } =
      await import('@/lib/rsvp/rsvp-invitation-queue');

    const result = await publishRsvpInvitation('response-1');

    expect(RSVP_INVITATION_QUEUE_TOPIC).toBe('rsvp-invitations');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'rsvp-invitations',
      { responseId: 'response-1' },
      { idempotencyKey: 'response-1' },
    );
    expect(result).toEqual({ messageId: 'msg-123' });
  });

  test('propagates errors from the underlying send call', async () => {
    send.mockRejectedValue(new Error('queue unavailable'));

    const { publishRsvpInvitation } = await import(
      '@/lib/rsvp/rsvp-invitation-queue'
    );

    await expect(publishRsvpInvitation('response-2')).rejects.toThrow(
      'queue unavailable',
    );
  });

  test('surfaces a null messageId when the server defers processing', async () => {
    send.mockResolvedValue({ messageId: null });

    const { publishRsvpInvitation } = await import(
      '@/lib/rsvp/rsvp-invitation-queue'
    );

    const result = await publishRsvpInvitation('response-3');

    expect(result).toEqual({ messageId: null });
  });
});
