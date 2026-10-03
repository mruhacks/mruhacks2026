import * as React from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Shell for a bento cell: a titled card with an optional action on the right
 * (the mockup's "+ Add", "Edit questions", "Export CSV").
 */
export function BentoCard({
  title,
  description,
  action,
  className,
  contentClassName,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      <CardHeader className='flex flex-row items-center justify-between gap-4 border-b px-6 py-4'>
        <div className='min-w-0'>
          <h2
            className='m-0 truncate'
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 'var(--fw-semibold)',
              fontSize: '16px',
            }}
          >
            {title}
          </h2>
          {description && (
            <p className='text-muted-foreground mt-0.5 text-sm'>
              {description}
            </p>
          )}
        </div>
        {action && <div className='shrink-0'>{action}</div>}
      </CardHeader>
      <CardContent className={cn('px-6 py-5', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

/** Matching skeleton, so a cell's fallback occupies the space it will fill. */
export function BentoCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <CardHeader className='border-b px-6 py-4'>
        <div className='bg-muted h-5 w-40 animate-pulse rounded-sm' />
      </CardHeader>
      <CardContent className='space-y-3 px-6 py-5'>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className='bg-muted h-4 w-full animate-pulse rounded-sm'
          />
        ))}
      </CardContent>
    </Card>
  );
}
