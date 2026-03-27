import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('better-auth/cookies', () => ({
  getSessionCookie: vi.fn(),
}));

import { getSessionCookie } from 'better-auth/cookies';
import { proxy } from '@/proxy';

describe('proxy', () => {
  beforeEach(() => {
    vi.mocked(getSessionCookie).mockReset();
  });

  it('redirects to signin with callbackUrl when no session cookie', async () => {
    vi.mocked(getSessionCookie).mockReturnValue(null);
    const req = new NextRequest('http://localhost:3000/dashboard/events');
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/signin?callbackUrl=%2Fdashboard%2Fevents',
    );
  });

  it('continues when session cookie is present', async () => {
    vi.mocked(getSessionCookie).mockReturnValue('session-token');
    const req = new NextRequest('http://localhost:3000/dashboard');
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });
});
