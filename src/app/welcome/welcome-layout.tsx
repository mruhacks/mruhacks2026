'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WelcomeStep = {
  id: string;
  label: string;
  completed: boolean;
  reviewable: boolean;
};

/**
 * Step indicator for the welcome wizard's layout. Since each step is now a
 * real route, the active step comes straight from the URL (usePathname) —
 * no state to keep in sync, no restore-on-reload logic needed.
 *
 * Completed earlier steps are links into explicit review mode. The server gate
 * still rejects unfinished future steps, so this cannot be used to skip ahead.
 */
export function WelcomeStepNav({ steps }: { steps: WelcomeStep[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeStep = pathname.split('/').pop();

  const hrefForReview = (id: string) => {
    const params = new URLSearchParams();
    const returnUrl = searchParams.get('returnUrl');
    if (returnUrl) params.set('returnUrl', returnUrl);
    params.set('review', '1');
    return `/welcome/${id}?${params.toString()}`;
  };

  if (steps.length <= 1) return null;

  return (
    <nav className='mt-5' aria-label='Onboarding steps'>
      {/* Below sm: a fixed 2-column grid, so a row always wraps at a step
          boundary and a connector never dangles off a row's edge — it only
          ever runs between the two steps sharing that row. At sm+ there's
          room for a single centered row instead. */}
      <ol className='grid grid-cols-2 items-center gap-x-4 gap-y-3 text-sm sm:flex sm:justify-center sm:gap-2'>
        {steps.map((step, index) => {
          const complete = step.completed;
          const active = step.id === activeStep;
          const hasConnector = index < steps.length - 1;
          // Right column of the mobile grid: its connector would run off the
          // row's edge, so it only appears once we're back to a single row
          // at sm+.
          const isMobileRowEnd = index % 2 === 1;
          return (
            <li key={step.id} className='flex min-w-0 items-center gap-2'>
              {step.reviewable && !active ? (
                <Link
                  href={hrefForReview(step.id)}
                  className='flex items-center gap-2 rounded-md whitespace-nowrap hover:opacity-80'
                >
                  <span className='bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium'>
                    <Check className='size-4' />
                  </span>
                  <span className='text-muted-foreground'>{step.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={active ? 'step' : undefined}
                  className='flex items-center gap-2 rounded-md whitespace-nowrap'
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                      complete || active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {complete && !active ? (
                      <Check className='size-4' />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      active ? 'font-medium' : 'text-muted-foreground',
                    )}
                  >
                    {step.label}
                  </span>
                </span>
              )}
              {hasConnector && (
                <span
                  className={cn(
                    'bg-border h-px',
                    isMobileRowEnd
                      ? 'hidden sm:block sm:w-10 sm:shrink-0'
                      : 'flex-1 sm:w-10 sm:flex-none sm:shrink-0',
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
