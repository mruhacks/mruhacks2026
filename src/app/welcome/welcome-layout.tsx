'use client';

import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';

export type WelcomeStep = {
  id: string;
  label: string;
};

export function WelcomeLayout({
  isFirstLogin,
  userEmail,
  steps,
  activeStep,
  onStepClick,
  children,
}: {
  isFirstLogin: boolean;
  userEmail: string;
  steps: WelcomeStep[];
  activeStep: string;
  /** Called with a step id when the user clicks a step they've already passed. */
  onStepClick?: (stepId: string) => void;
  children: React.ReactNode;
}) {
  const currentIndex = steps.findIndex((step) => step.id === activeStep);

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6'>
      <Card className='px-4 sm:px-8'>
        <header className='border-b pb-6'>
          <h1 className='text-2xl font-semibold'>
            {isFirstLogin ? 'Welcome!' : 'Welcome back!'}
          </h1>
          <p className='text-muted-foreground mt-2 text-sm'>
            Signed in as <span className='font-medium'>{userEmail}</span>. Set
            up your account to continue.
          </p>
          {steps.length > 1 && (
            <nav className='mt-5' aria-label='Onboarding steps'>
              <ol className='flex items-center gap-2 text-sm' role='tablist'>
                {steps.map((step, index) => {
                  const complete = index < currentIndex;
                  const active = step.id === activeStep;
                  const clickable = complete && Boolean(onStepClick);
                  return (
                    <li
                      key={step.id}
                      className='flex flex-1 items-center gap-2'
                    >
                      <button
                        type='button'
                        role='tab'
                        aria-selected={active}
                        disabled={!clickable}
                        onClick={
                          clickable ? () => onStepClick?.(step.id) : undefined
                        }
                        className={`flex items-center gap-2 rounded-md ${
                          clickable
                            ? 'cursor-pointer hover:opacity-80'
                            : 'cursor-default'
                        }`}
                      >
                        <span
                          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                            complete || active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {complete ? <Check className='size-4' /> : index + 1}
                        </span>
                        <span
                          className={
                            active ? 'font-medium' : 'text-muted-foreground'
                          }
                        >
                          {step.label}
                        </span>
                      </button>
                      {index < steps.length - 1 && (
                        <span className='bg-border h-px flex-1' />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </header>
        <section className='py-8'>{children}</section>
      </Card>
    </main>
  );
}
