import { describe, expect, test, vi } from 'vitest';

import * as Auth from '@/lib/auth';

describe('toEmailLinkConfirmUrl', () => {
  test('points a magic link at the confirm page and keeps every query param', () => {
    const verify = new URL(
      'https://mruhacks.ca/api/auth/magic-link/verify?token=abc&callbackURL=%2Fdashboard%2Fevents%2Fx%3Frsvp%3D1',
    );
    const confirm = new URL(Auth.toEmailLinkConfirmUrl('magic-link', verify.toString()));

    expect(confirm.origin).toBe(verify.origin);
    expect(confirm.pathname).toBe(Auth.EMAIL_LINK_CONFIRM_PATH);
    expect(confirm.searchParams.get(Auth.EMAIL_LINK_KIND_PARAM)).toBe('magic-link');
    confirm.searchParams.delete(Auth.EMAIL_LINK_KIND_PARAM);
    expect([...confirm.searchParams]).toEqual([...verify.searchParams]);
  });

  test('wraps verify-email links too', () => {
    const confirm = new URL(
      Auth.toEmailLinkConfirmUrl('verify-email', 'https://mruhacks.ca/api/auth/verify-email?token=jwt&callbackURL=%2F'),
    );

    expect(confirm.pathname).toBe(Auth.EMAIL_LINK_CONFIRM_PATH);
    expect(confirm.searchParams.get(Auth.EMAIL_LINK_KIND_PARAM)).toBe('verify-email');
    expect(confirm.searchParams.get('token')).toBe('jwt');
  });

  test('sends the raw link when Better Auth built it under another path', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = 'https://mruhacks.ca/auth/magic-link/verify?token=abc';

    expect(Auth.toEmailLinkConfirmUrl('magic-link', raw)).toBe(raw);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

describe('MAGIC_LINK_ERROR_CALLBACK_URL', () => {
  test("passes Better Auth's errorCallbackURL check", () => {
    // Better Auth decodeURIComponent()s the already-parsed query value, then
    // only accepts a relative path matching this pattern.
    expect(decodeURIComponent(Auth.MAGIC_LINK_ERROR_CALLBACK_URL)).toMatch(
      /^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/,
    );
  });
});

describe('toSameOriginPath', () => {
  test('keeps same-origin paths', () => {
    expect(Auth.toSameOriginPath('/dashboard/events/x?source=rsvp')).toBe('/dashboard/events/x?source=rsvp');
  });

  test.each(['https://evil.example/', '//evil.example/', '/\\evil.example/', 'dashboard', undefined, ['/dashboard']])(
    'rejects %j',
    (value) => {
      expect(Auth.toSameOriginPath(value)).toBeNull();
    },
  );
});
