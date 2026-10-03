import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

const runScheduledRsvpWaves = vi.fn();
const requeuePendingRsvpInvitations = vi.fn();

vi.mock('@/lib/rsvp/run-scheduled-rsvp-waves', () => ({
  runScheduledRsvpWaves,
}));

vi.mock('@/lib/rsvp/requeue-pending-rsvp-invitations', () => ({
  requeuePendingRsvpInvitations,
}));

const WAVES_RESULT = {
  timedOutCount: 0,
  eventsConsidered: 0,
  wavesSent: 0,
  results: [],
};

const SWEEP_RESULT = {
  inspected: 3,
  queued: 2,
  skipped: 1,
  publishFailures: 0,
};

function request(token?: string): Request {
  return new Request('http://localhost/api/cron/rsvp', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('/api/cron/rsvp', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
    runScheduledRsvpWaves.mockReset();
    runScheduledRsvpWaves.mockResolvedValue(WAVES_RESULT);
    requeuePendingRsvpInvitations.mockReset();
    requeuePendingRsvpInvitations.mockResolvedValue(SWEEP_RESULT);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  test('rejects requests without a bearer token', async () => {
    const { POST } = await import('@/app/api/cron/rsvp/route');
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(runScheduledRsvpWaves).not.toHaveBeenCalled();
    expect(requeuePendingRsvpInvitations).not.toHaveBeenCalled();
  });

  test('rejects a wrong bearer token', async () => {
    const { POST } = await import('@/app/api/cron/rsvp/route');
    const response = await POST(request('wrong-secret'));
    expect(response.status).toBe(401);
    expect(runScheduledRsvpWaves).not.toHaveBeenCalled();
    expect(requeuePendingRsvpInvitations).not.toHaveBeenCalled();
  });

  test('rejects every request when no cron secret is configured', async () => {
    delete process.env.CRON_SECRET;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { POST } = await import('@/app/api/cron/rsvp/route');
    const response = await POST(request(''));
    expect(response.status).toBe(401);
    expect(runScheduledRsvpWaves).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('runs waves then the sweep and returns both results', async () => {
    const { POST } = await import('@/app/api/cron/rsvp/route');
    const response = await POST(request('test-cron-secret'));

    expect(response.status).toBe(200);
    expect(runScheduledRsvpWaves).toHaveBeenCalledTimes(1);
    expect(requeuePendingRsvpInvitations).toHaveBeenCalledTimes(1);
    expect(runScheduledRsvpWaves.mock.invocationCallOrder[0]).toBeLessThan(
      requeuePendingRsvpInvitations.mock.invocationCallOrder[0],
    );
    expect(await response.json()).toEqual({
      waves: WAVES_RESULT,
      sweep: SWEEP_RESULT,
    });
  });

  test('still runs the sweep when the wave step throws, then returns 500', async () => {
    runScheduledRsvpWaves.mockRejectedValueOnce(new Error('db down'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { POST } = await import('@/app/api/cron/rsvp/route');
    const response = await POST(request('test-cron-secret'));

    expect(response.status).toBe(500);
    expect(requeuePendingRsvpInvitations).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  test('returns 500 when the sweep throws', async () => {
    requeuePendingRsvpInvitations.mockRejectedValueOnce(new Error('db down'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { POST } = await import('@/app/api/cron/rsvp/route');
    const response = await POST(request('test-cron-secret'));

    expect(response.status).toBe(500);
    expect(runScheduledRsvpWaves).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe('RSVP cron schedule', () => {
  test('is not also scheduled by Vercel Cron', () => {
    // A second scheduler could run the invitation sweep concurrently with the
    // Worker and double-send a stuck invitation.
    const vercel = JSON.parse(
      readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons?: unknown[] };
    expect(vercel.crons ?? []).toEqual([]);
  });

  test('runs hourly via the Cloudflare Worker scheduler', () => {
    const wrangler = JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'workers/rsvp-cron/wrangler.json'),
        'utf8',
      ),
    ) as { triggers: { crons: string[] } };
    expect(wrangler.triggers.crons).toEqual(['0 * * * *']);
  });
});
