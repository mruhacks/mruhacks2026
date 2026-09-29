'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useEventBasePath } from './use-event-base-path';

export function EventBackLink() {
  const pathname = usePathname();
  const basePath = useEventBasePath();
  const isOverview = pathname === basePath;
  const isSettingsSubpage = pathname.startsWith(`${basePath}/settings/`);

  return (
    <Button asChild variant='ghost' size='sm'>
      <Link
        href={
          isSettingsSubpage
            ? `${basePath}/settings`
            : isOverview
              ? '/dashboard/admin/events'
              : basePath
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
