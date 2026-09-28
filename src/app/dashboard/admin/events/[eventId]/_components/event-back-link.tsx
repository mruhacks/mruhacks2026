'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function EventBackLink({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const eventPath = `/dashboard/admin/events/${eventId}`;
  const isOverview = pathname === eventPath;
  const isSettingsSubpage = pathname.startsWith(`${eventPath}/settings/`);

  return (
    <Button asChild variant='ghost' size='sm'>
      <Link
        href={
          isSettingsSubpage
            ? `${eventPath}/settings`
            : isOverview
              ? '/dashboard/admin/events'
              : eventPath
        }
      >
        <ArrowLeft aria-hidden data-icon='inline-start' />
        {isSettingsSubpage
          ? 'Back to edit event'
          : isOverview
            ? 'All events'
            : 'Back to event'}
      </Link>
    </Button>
  );
}
