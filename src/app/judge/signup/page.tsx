import * as React from 'react';
import { redirect } from 'next/navigation';

import { NotOnRoster, requireOnboardedJudge } from '../judge-gate';

/**
 * Where a judge's "You're judging" magic link lands. Only for people already
 * on a roster: they're sent through onboarding and on to their events;
 * anyone else is told to ask an organizer.
 */
export default function JudgeSignupPage() {
  return (
    <React.Suspense fallback={null}>
      <JudgeSignup />
    </React.Suspense>
  );
}

async function JudgeSignup() {
  const user = await requireOnboardedJudge('/judge');
  if (!user) return <NotOnRoster />;
  redirect('/judge');
}
