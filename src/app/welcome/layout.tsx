import type { ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  canReviewStep,
  getOnboardingProgress,
  type Step,
} from './onboarding-progress';
import { WelcomeStepNav, type WelcomeStep } from './welcome-layout';

export default async function WelcomeRouteLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  const progress = await getOnboardingProgress();

  const steps: WelcomeStep[] = [
    {
      id: 'legal' satisfies Step,
      label: 'Legal',
      completed: !progress.needsConsent,
      reviewable: canReviewStep(progress, 'legal'),
    },
    {
      id: 'personal' satisfies Step,
      label: 'Personal',
      completed: !progress.needsPersonal,
      reviewable: canReviewStep(progress, 'personal'),
    },
    {
      id: 'about' satisfies Step,
      label: 'About you',
      completed: !progress.needsAbout,
      reviewable: canReviewStep(progress, 'about'),
    },
    ...(progress.featuredEvent
      ? [
          {
            id: 'event' satisfies Step,
            label: 'Apply',
            completed: false,
            reviewable: false,
          },
        ]
      : []),
  ];

  return (
    <>
      <main className='mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6'>
        <Card className='gap-0'>
          <CardHeader className='px-4 pb-6 sm:px-8'>
            <CardTitle className='text-2xl'>
              <h1>{progress.isFirstLogin ? 'Welcome!' : 'Welcome back!'}</h1>
            </CardTitle>
            <CardDescription>
              Signed in as{' '}
              <span className='font-medium'>{progress.user.email}</span>. Set up
              your account to continue.
            </CardDescription>
            <WelcomeStepNav steps={steps} />
          </CardHeader>
          <Separator />
          <CardContent className='px-4 py-8 sm:px-8'>{children}</CardContent>
        </Card>
      </main>
      {modal}
    </>
  );
}
