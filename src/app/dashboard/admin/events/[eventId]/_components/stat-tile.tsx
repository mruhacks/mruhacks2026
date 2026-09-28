import * as React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { Card } from '@/components/ui/card';

/**
 * One of the four headline tiles. The number uses the display face and the
 * label the mono caption treatment, matching the event cards on the admin
 * events list.
 */
export function StatTile({
  icon,
  label,
  value,
  footnote,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  footnote?: React.ReactNode;
  /** Makes the whole tile a link to its tool page. */
  href?: string;
}) {
  return (
    <Card className='relative gap-0 p-5'>
      {href && (
        /* Stretched rather than wrapping the card, so the whole tile is the
           click target — same trick as the admin events list. */
        <Link
          href={href}
          className='hover:border-primary/40 absolute inset-0 rounded-xl border border-transparent'
          aria-label={`Open ${label}`}
        >
          <ExternalLink
            aria-hidden
            className='text-muted-foreground pointer-events-none absolute top-5 right-5 size-4'
          />
        </Link>
      )}
      <span
        aria-hidden
        className='text-accent-foreground pointer-events-none relative flex size-9 w-fit items-center justify-center rounded-lg'
      >
        {icon}
      </span>

      <p
        className='mt-4 mb-0'
        style={{
          fontFamily: 'var(--font-ui)',
          fontWeight: 'var(--fw-semibold)',
          fontSize: '14px',
        }}
      >
        {label}
      </p>
      <p
        className='m-0'
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 'var(--fw-semibold)',
          fontSize: '34px',
          lineHeight: 'var(--lh-tight)',
          letterSpacing: 'var(--track-display)',
        }}
      >
        {value}
      </p>
      {footnote && (
        <p className='text-muted-foreground m-0 mt-1 text-xs'>{footnote}</p>
      )}
    </Card>
  );
}

export function StatTileSkeleton() {
  return (
    <Card className='gap-0 p-5'>
      <div className='bg-muted size-9 animate-pulse rounded-lg' />
      <div className='bg-muted mt-4 h-4 w-24 animate-pulse rounded-sm' />
      <div className='bg-muted mt-2 h-9 w-16 animate-pulse rounded-sm' />
    </Card>
  );
}
