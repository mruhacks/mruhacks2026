/**
 * Tests for src/app/dashboard/account/actions.ts
 *
 * All actions require only authentication (no permission gate), so the only
 * RBAC scenario to test is unauthenticated → fail('User not authenticated').
 */
import { describe, test, expect, vi } from 'vitest';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('@/utils/consent-check', () => ({
  userNeedsConsent: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/consent', () => ({
  CURRENT_TERMS_VERSION: '1.0',
  CURRENT_PRIVACY_VERSION: '1.0',
}));

import { getUser } from '@/utils/auth';
import {
  getAccountOverview,
  getConsent,
  getConsentStatus,
  setMarketingConsent,
  recordOnboardingConsent,
  completeWelcomeOnboarding,
  exportMyData,
} from '@/app/dashboard/account/actions';

function asUnauthed() {
  vi.mocked(getUser).mockResolvedValueOnce(null as never);
}

describe('account actions — unauthenticated', () => {
  test('getAccountOverview fails', async () => {
    asUnauthed();
    await expect(getAccountOverview()).resolves.toMatchObject({
      success: false,
    });
  });

  test('getConsent fails', async () => {
    asUnauthed();
    await expect(getConsent()).resolves.toMatchObject({ success: false });
  });

  test('getConsentStatus fails', async () => {
    asUnauthed();
    await expect(getConsentStatus()).resolves.toMatchObject({ success: false });
  });

  test('setMarketingConsent fails', async () => {
    asUnauthed();
    await expect(setMarketingConsent(true)).resolves.toMatchObject({
      success: false,
    });
  });

  test('recordOnboardingConsent fails', async () => {
    asUnauthed();
    await expect(recordOnboardingConsent(false)).resolves.toMatchObject({
      success: false,
    });
  });

  test('completeWelcomeOnboarding fails', async () => {
    asUnauthed();
    await expect(completeWelcomeOnboarding()).resolves.toMatchObject({
      success: false,
    });
  });

  test('exportMyData fails', async () => {
    asUnauthed();
    await expect(exportMyData()).resolves.toMatchObject({ success: false });
  });
});
