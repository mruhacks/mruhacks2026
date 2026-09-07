import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

const requeuePendingRsvpInvitations = vi.fn();

vi.mock('@/lib/rsvp/requeue-pending-rsvp-invitations', () => ({
  requeuePendingRsvpInvitations,
}));

describe('GET /api/cron/rsvp-invitation-sweep', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
    requeuePendingRsvpInvitations.mockReset();
    requeuePendingRsvpInvitations.mockResolvedValue({
      inspected: 0,
      queued: 0,
      skipped: 0,
      publishFailures: 0,
    });
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  test('rejects unauthorized requests', async () => {
    const { GET } = await import('@/app/api/cron/rsvp-invitation-sweep/route');
    const response = await GET(
      new Request('http://localhost/api/cron/rsvp-invitation-sweep'),
    );
    expect(response.status).toBe(401);
    expect(requeuePendingRsvpInvitations).not.toHaveBeenCalled();
  });

  test('rejects a wrong bearer token', async () => {
    const { GET } = await import('@/app/api/cron/rsvp-invitation-sweep/route');
    const response = await GET(
      new Request('http://localhost/api/cron/rsvp-invitation-sweep', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );
    expect(response.status).toBe(401);
    expect(requeuePendingRsvpInvitations).not.toHaveBeenCalled();
  });

  test('invokes the sweep and returns its result when authorized', async () => {
    requeuePendingRsvpInvitations.mockResolvedValue({
      inspected: 3,
      queued: 2,
      skipped: 1,
      publishFailures: 0,
    });

    const { GET } = await import('@/app/api/cron/rsvp-invitation-sweep/route');
    const response = await GET(
      new Request('http://localhost/api/cron/rsvp-invitation-sweep', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(response.status).toBe(200);
    expect(requeuePendingRsvpInvitations).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body).toEqual({
      inspected: 3,
      queued: 2,
      skipped: 1,
      publishFailures: 0,
    });
  });

  test('returns 500 when the sweep throws', async () => {
    requeuePendingRsvpInvitations.mockRejectedValueOnce(new Error('db down'));

    const { GET } = await import('@/app/api/cron/rsvp-invitation-sweep/route');
    const response = await GET(
      new Request('http://localhost/api/cron/rsvp-invitation-sweep', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(response.status).toBe(500);
  });
});
