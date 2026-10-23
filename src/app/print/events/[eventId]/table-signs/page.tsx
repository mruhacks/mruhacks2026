import * as React from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { getJudgingTableSigns } from '@/app/dashboard/admin/events/judging-actions';
import { resolveEventId } from '@/lib/events';
import { formatTableLabel, MAX_TABLE_SIGNS } from '@/lib/judging/table-label';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { PrintButton } from './print-button';
import { SignCountForm } from './sign-count-form';
import { TableSign } from './table-sign';

type Props = {
  params: Promise<{ eventId: string }>;
  /** `count`: print this many signs instead of the tables handed out so far. */
  searchParams: Promise<{ count?: string | string[] }>;
};

/** A usable `?count=`, or null to fall back to the tables handed out. */
function parseCount(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const count = Number(raw);
  return Number.isInteger(count) && count >= 1 && count <= MAX_TABLE_SIGNS ? count : null;
}

export const metadata: Metadata = { title: 'Table signs' };

/**
 * One printable sheet per expo table, opened in its own tab from the judging
 * table layout card. Lives outside `/dashboard` so none of the dashboard's
 * chrome ends up on paper; `proxy.ts` still covers it for the session and
 * consent redirects.
 */
export default function TableSignsRoute({ params, searchParams }: Props) {
  return (
    <React.Suspense fallback={<div className='min-h-screen' />}>
      <TableSigns paramsPromise={params} searchParamsPromise={searchParams} />
    </React.Suspense>
  );
}

async function TableSigns({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Props['params'];
  searchParamsPromise: Props['searchParams'];
}) {
  const [{ eventId: segment }, { count: rawCount }] = await Promise.all([paramsPromise, searchParamsPromise]);
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  // Same permission as the table layout the signs are printed from.
  await requirePermission(user.id, 'judging:manage:all');

  const result = await getJudgingTableSigns(eventId);
  if (!result.success || !result.data) {
    return <p className='text-destructive p-6'>{!result.success ? result.error : 'Failed to load tables.'}</p>;
  }
  const { layout, handedOut } = result.data;
  // Printing ahead of time: an organizer can ask for more (or fewer) signs
  // than tables handed out. Labels follow the saved layout either way.
  const requested = parseCount(rawCount);
  const count = requested ?? handedOut;
  const labels = Array.from({ length: count }, (_, slot) => formatTableLabel(slot, layout));

  return (
    <>
      {/* One landscape Letter page per sign, edge to edge — each sheet
          supplies its own margins. */}
      <style>{'@page { size: letter landscape; margin: 0; }'}</style>

      <main className='bg-muted min-h-screen print:bg-white'>
        <div className='bg-background sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b px-6 py-3 print:hidden'>
          <div>
            <h1 className='text-base font-semibold'>Table signs</h1>
            <p className='text-muted-foreground text-sm'>
              {handedOut === 0
                ? 'No tables have been handed out yet; a project gets one the first time it’s published.'
                : `${handedOut} ${handedOut === 1 ? 'table' : 'tables'} handed out so far.`}{' '}
              One sign per page (Letter, landscape).
            </p>
          </div>
          <div className='flex items-start gap-2'>
            <SignCountForm count={count} handedOut={handedOut} />
            {labels.length > 0 && <PrintButton />}
          </div>
        </div>

        <div className='flex flex-col items-center gap-6 p-6 print:block print:p-0'>
          {labels.map((label) => (
            <TableSign key={label} label={label} />
          ))}
        </div>
      </main>
    </>
  );
}
