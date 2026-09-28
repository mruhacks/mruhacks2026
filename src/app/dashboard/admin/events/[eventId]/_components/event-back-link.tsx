'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function EventBackLink({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const eventPath = `/dashboard/admin/events/${eventId}`;
  const isOverview = pathname === eventPath;
  const isArticle =
    pathname === `${eventPath}/wiki` && Boolean(searchParams.get('article'));
  const isSettingsSubpage = pathname.startsWith(`${eventPath}/settings/`);

  return (
    <Button asChild variant='ghost' size='sm'>
      <Link
        href={
          isArticle
            ? `${eventPath}/wiki`
            : isSettingsSubpage
              ? `${eventPath}/settings`
              : isOverview
                ? '/dashboard/admin/events'
                : eventPath
        }
      >
        <ArrowLeft aria-hidden data-icon='inline-start' />
        {isArticle
          ? 'All articles'
          : isSettingsSubpage
            ? 'Back to edit event'
            : isOverview
              ? 'All events'
              : 'Back to event'}
      </Link>
    </Button>
  );
}
