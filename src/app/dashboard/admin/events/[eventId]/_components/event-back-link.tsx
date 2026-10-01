'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { sanitizeReturnPath } from '@/utils/return-path';
import { useEventBasePath } from './use-event-base-path';

export function EventBackLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const basePath = useEventBasePath();
  const isOverview = pathname === basePath;
  const isSettingsSubpage = pathname.startsWith(`${basePath}/settings/`);

  return (
    <Button asChild variant='ghost' size='sm'>
      <Link
        href={sanitizeReturnPath(
          searchParams.get('back'),
          isSettingsSubpage
            ? `${basePath}/settings`
            : isOverview
              ? '/dashboard/admin/events'
              : basePath,
        )}
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
