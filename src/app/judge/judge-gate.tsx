import { redirect } from 'next/navigation';

import {
  getNextStep,
  getOnboardingProgress,
  stepUrl,
} from '@/app/welcome/onboarding-progress';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { isOnAnyJudgeRoster } from '@/lib/judging/server';
import { getUser } from '@/utils/auth';

/**
 * Shared gate for the judge pages: signed in, on some roster, and through
 * the judge onboarding path (legal → personal → professional). Returns the
 * user, or null when they aren't on any roster — the caller shows
 * `NotOnRoster` then.
 */
export async function requireOnboardedJudge(returnPath: string) {
  const user = await getUser();
  if (!user) redirect(`/signin?redirect=${encodeURIComponent(returnPath)}`);
  if (!(await isOnAnyJudgeRoster(user))) return null;

  const next = getNextStep(await getOnboardingProgress());
  if (next !== null) redirect(stepUrl(next, returnPath));
  return user;
}

export function NotOnRoster() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;re not on a judging roster</CardTitle>
        <CardDescription>
          Ask an organizer to add you. Once they do, you&apos;ll get an email
          with a link to sign in.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
