import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

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

  test('surfaces a null messageId when the server defers processing', async () => {
    send.mockResolvedValue({ messageId: null });

    const { publishRsvpInvitation } = await import(
      '@/lib/rsvp/rsvp-invitation-queue'
    );

    const result = await publishRsvpInvitation('response-3');

    expect(result).toEqual({ messageId: null });
  });

  describe('retry behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('retries once and succeeds on the second attempt', async () => {
      send
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce({ messageId: 'msg-2' });

      const { publishRsvpInvitation } = await import(
        '@/lib/rsvp/rsvp-invitation-queue'
      );

      const promise = publishRsvpInvitation('response-1');
      await vi.advanceTimersByTimeAsync(250);
      const result = await promise;

      expect(result).toEqual({ messageId: 'msg-2' });
      expect(send).toHaveBeenCalledTimes(2);
    });

    test('retries twice and succeeds on the third attempt', async () => {
      send
        .mockRejectedValueOnce(new Error('transient 1'))
        .mockRejectedValueOnce(new Error('transient 2'))
        .mockResolvedValueOnce({ messageId: 'msg-3' });

      const { publishRsvpInvitation } = await import(
        '@/lib/rsvp/rsvp-invitation-queue'
      );

      const promise = publishRsvpInvitation('response-1');
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result).toEqual({ messageId: 'msg-3' });
      expect(send).toHaveBeenCalledTimes(3);
    });

    test('gives up and throws the final error after exhausting all attempts', async () => {
      send
        .mockRejectedValueOnce(new Error('transient 1'))
        .mockRejectedValueOnce(new Error('transient 2'))
        .mockRejectedValueOnce(new Error('final failure'));

      const { publishRsvpInvitation } = await import(
        '@/lib/rsvp/rsvp-invitation-queue'
      );

      const promise = publishRsvpInvitation('response-1');
      // Attach a rejection handler immediately so the pending rejection
      // doesn't trigger an unhandled-rejection warning while timers advance.
      const expectation = expect(promise).rejects.toThrow('final failure');
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(500);
      await expectation;

      expect(send).toHaveBeenCalledTimes(3);
    });

    test('never exceeds three total publish attempts', async () => {
      send.mockRejectedValue(new Error('always fails'));

      const { publishRsvpInvitation } = await import(
        '@/lib/rsvp/rsvp-invitation-queue'
      );

      const promise = publishRsvpInvitation('response-1');
      const expectation = expect(promise).rejects.toThrow('always fails');
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(10_000);
      await expectation;

      expect(send).toHaveBeenCalledTimes(3);
    });

    test('uses the same idempotency key on every retry attempt', async () => {
      send
        .mockRejectedValueOnce(new Error('transient 1'))
        .mockRejectedValueOnce(new Error('transient 2'))
        .mockResolvedValueOnce({ messageId: 'msg-4' });

      const { publishRsvpInvitation } = await import(
        '@/lib/rsvp/rsvp-invitation-queue'
      );

      const promise = publishRsvpInvitation('response-42');
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(send).toHaveBeenCalledTimes(3);
      for (const call of send.mock.calls) {
        expect(call[0]).toBe('rsvp-invitations');
        expect(call[1]).toEqual({ responseId: 'response-42' });
        expect(call[2]).toEqual({ idempotencyKey: 'response-42' });
      }
    });
  });
});
