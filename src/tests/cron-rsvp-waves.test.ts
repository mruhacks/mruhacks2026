import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

const runScheduledRsvpWaves = vi.fn();

vi.mock('@/lib/rsvp/run-scheduled-rsvp-waves', () => ({
  runScheduledRsvpWaves,
}));

describe('GET /api/cron/rsvp-waves', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
    runScheduledRsvpWaves.mockReset();
    runScheduledRsvpWaves.mockResolvedValue({
      timedOutCount: 0,
      eventsConsidered: 0,
      wavesSent: 0,
      results: [],
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
    const { GET } = await import('@/app/api/cron/rsvp-waves/route');
    const response = await GET(
      new Request('http://localhost/api/cron/rsvp-waves'),
    );
    expect(response.status).toBe(401);
    expect(runScheduledRsvpWaves).not.toHaveBeenCalled();
  });

  test('runs the scheduled orchestration when authorized', async () => {
    const { GET } = await import('@/app/api/cron/rsvp-waves/route');
    const response = await GET(
      new Request('http://localhost/api/cron/rsvp-waves', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );
    expect(response.status).toBe(200);
    expect(runScheduledRsvpWaves).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.wavesSent).toBe(0);
  });
});

describe('RSVP waves cron schedule', () => {
  test('is configured once daily in vercel.json', () => {
    const vercel = JSON.parse(
      readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'),
    ) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const cron = vercel.crons.find(
      (entry) => entry.path === '/api/cron/rsvp-waves',
    );
    expect(cron?.schedule).toBe('0 0 * * *');
  });
});
