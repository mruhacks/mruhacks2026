'use client';

/**
 * Make the current, successfully submitted step reviewable in browser history
 * before pushing the next route. Browser Back then reopens the saved form,
 * while a normal non-review URL still skips completed steps on reload.
 */
export function markCurrentWelcomeStepReviewable() {
  const url = new URL(window.location.href);
  url.searchParams.set('review', '1');
  window.history.replaceState(null, '', url);
}
