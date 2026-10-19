'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { sanitizeReturnPath } from '@/utils/return-path';

export type Crumb = { label: string; href: string };

/**
 * The crumb one level above the current page. A page whose own segment has no
 * label (a wiki article, a judge's table) never gets a crumb of its own, so
 * the last crumb is already its parent.
 */
function parentCrumb(pathname: string, crumbs: Crumb[]): Crumb | null {
  const last = crumbs.at(-1);
  if (!last) return null;
  if (last.href !== pathname) return last;
  return crumbs.at(-2) ?? null;
}

/**
 * The dashboard's one "up a level" control. It lives in the header so no page
 * spends a row of its own on a back button.
 *
 * On phones, where the breadcrumb trail is hidden, it stands in for it by
 * pointing at the parent crumb. A `?back=` on the URL wins over the trail: the
 * page that linked here knows where the visitor came from (a sub-event's edit
 * form opened from its parent's schedule, a project opened from the teams
 * table) better than the path does, and since the trail can't express that,
 * the link stays visible on desktop too.
 */
export function DashboardBackLink({
  pathname,
  crumbs,
}: {
  pathname: string;
  crumbs: Crumb[];
}) {
  const searchParams = useSearchParams();
  const backHref = sanitizeReturnPath(searchParams.get('back'), '');
  const target = backHref
    ? { label: 'Back', href: backHref }
    : parentCrumb(pathname, crumbs);
  if (!target) return null;

  return (
    <Link
      href={target.href}
      className={cn(
        'flex min-w-0 items-center gap-0.5',
        !backHref && 'sm:hidden',
      )}
      style={{
        fontFamily: 'var(--font-ui)',
        fontWeight: 'var(--fw-semibold)',
        fontSize: '15px',
        letterSpacing: 'var(--track-ui)',
        color: 'var(--ink-500)',
        textDecoration: 'none',
      }}
    >
      <ChevronLeft aria-hidden className='size-4 shrink-0' />
      <span className='truncate'>{target.label}</span>
    </Link>
  );
}
