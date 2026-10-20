import { describe, expect, test } from 'vitest';

import {
  canReviewStep,
  getNextStep,
  reviewStepUrl,
  type OnboardingProgress,
} from '@/app/welcome/onboarding-progress';

function progress(
  values: Pick<
    OnboardingProgress,
    'needsConsent' | 'needsPersonal' | 'needsAbout' | 'featuredEvent'
  >,
): OnboardingProgress {
  return values as OnboardingProgress;
}

describe('welcome onboarding progress', () => {
  test('does not allow review to skip an incomplete prerequisite', () => {
    const state = progress({
      needsConsent: true,
      needsPersonal: true,
      needsAbout: true,
      featuredEvent: undefined,
    });

    expect(getNextStep(state)).toBe('legal');
    expect(canReviewStep(state, 'legal')).toBe(false);
    expect(canReviewStep(state, 'personal')).toBe(false);
    expect(canReviewStep(state, 'about')).toBe(false);
  });

  test('allows completed earlier steps to reopen while a later step is pending', () => {
    const state = progress({
      needsConsent: false,
      needsPersonal: false,
      needsAbout: true,
      featuredEvent: undefined,
    });

    expect(getNextStep(state)).toBe('about');
    expect(canReviewStep(state, 'legal')).toBe(true);
    expect(canReviewStep(state, 'personal')).toBe(true);
    expect(canReviewStep(state, 'about')).toBe(false);
  });

  test('does not reopen steps after onboarding has no remaining work', () => {
    const state = progress({
      needsConsent: false,
      needsPersonal: false,
      needsAbout: false,
      featuredEvent: undefined,
    });

    expect(getNextStep(state)).toBeNull();
    expect(canReviewStep(state, 'legal')).toBe(false);
    expect(canReviewStep(state, 'personal')).toBe(false);
    expect(canReviewStep(state, 'about')).toBe(false);
  });

  test('builds an explicit review URL without dropping the return path', () => {
    expect(reviewStepUrl('personal', '/dashboard/events')).toBe(
      '/welcome/personal?returnUrl=%2Fdashboard%2Fevents&review=1',
    );
  });
});

describe('judge onboarding path', () => {
  function judge(
    values: Pick<
      OnboardingProgress,
      'needsConsent' | 'needsPersonal' | 'needsAbout' | 'needsProfessional'
    >,
  ): OnboardingProgress {
    return {
      ...values,
      isJudge: true,
      featuredEvent: { id: 'featured' },
    } as OnboardingProgress;
  }

  test('goes legal → personal → professional, skipping About and the featured event', () => {
    const state = judge({
      needsConsent: true,
      needsPersonal: true,
      needsAbout: true,
      needsProfessional: true,
    });
    expect(getNextStep(state)).toBe('legal');
    expect(getNextStep(state, 'legal')).toBe('personal');
    expect(getNextStep(state, 'personal')).toBe('professional');
    expect(getNextStep(state, 'professional')).toBeNull();
  });

  test('is done once Professional is, with About still empty', () => {
    const state = judge({
      needsConsent: false,
      needsPersonal: false,
      needsAbout: true,
      needsProfessional: false,
    });
    expect(getNextStep(state)).toBeNull();
  });

  test('participants never see the Professional step', () => {
    const state = progress({
      needsConsent: false,
      needsPersonal: false,
      needsAbout: false,
      featuredEvent: undefined,
    });
    expect(getNextStep(state)).toBeNull();
    expect(canReviewStep(state, 'professional')).toBe(false);
  });
});
