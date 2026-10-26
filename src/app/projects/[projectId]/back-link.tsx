'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeftIcon } from 'lucide-react';

import { sanitizeReturnPath } from '@/utils/return-path';

const CLASS_NAME = 'mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-(--ink-500) hover:text-black';

/**
 * Back to whichever page linked here (`?back=`, e.g. the homepage podium),
 * or the gallery without one. Rendered inside Suspense, so the page's static
 * shell carries `ProjectBackLinkFallback` until the query string is read.
 */
export function ProjectBackLink() {
  const back = sanitizeReturnPath(useSearchParams().get('back'), '');
  return (
    <Link href={back || '/projects'} className={CLASS_NAME}>
      <ChevronLeftIcon className='size-4' aria-hidden />
      {back ? 'Back' : 'All projects'}
    </Link>
  );
}

export function ProjectBackLinkFallback() {
  return (
    <Link href='/projects' className={CLASS_NAME}>
      <ChevronLeftIcon className='size-4' aria-hidden />
      All projects
    </Link>
  );
}
