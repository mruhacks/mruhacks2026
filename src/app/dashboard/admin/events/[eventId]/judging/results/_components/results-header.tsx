'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import { useEventBasePath } from '../../../_components/use-event-base-path';
import { useResults } from './results-context';

/** Title, the pool's status, and a link to each results table. */
export function ResultsHeader() {
  const { results } = useResults();
  const { canViewRankings } = results;
  const base = `${useEventBasePath()}/judging/results`;
  const pathname = usePathname();

  const links = canViewRankings
    ? [
        { href: `${base}/overall`, label: 'Overall' },
        ...results.byCriterion.map((criterion) => ({
          href: `${base}/criteria/${criterion.id}`,
          label: criterion.name,
        })),
        { href: `${base}/judges`, label: 'Judge reliability' },
      ]
    : [];

  return (
    <>
      <div>
        <h2 className='text-xl font-semibold'>
          {canViewRankings ? 'Results' : 'Awards'}
        </h2>
        <p className='text-muted-foreground text-sm'>
          {results.provisional
            ? 'Provisional: submissions are still open, so projects can still join or leave the pool. '
            : 'Only projects published at the submission deadline, and not deactivated, are included. '}
          {canViewRankings
            ? 'Updates every few seconds while this page is open.'
            : 'Record placements once the panel has decided.'}
        </p>
      </div>

      {/* Award-only viewers have the one table, so there's nothing to pick. */}
      {links.length > 0 && (
        <nav
          aria-label='Results tables'
          className='bg-muted text-muted-foreground inline-flex w-fit max-w-full flex-wrap items-center rounded-lg p-[3px]'
        >
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-foreground dark:text-muted-foreground focus-visible:ring-ring/50 inline-flex h-[30px] items-center justify-center rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1',
                  active &&
                    'bg-background dark:border-input dark:bg-input/30 dark:text-foreground shadow-sm',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
