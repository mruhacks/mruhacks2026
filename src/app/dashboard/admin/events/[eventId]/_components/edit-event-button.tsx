'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SquarePen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useEventBasePath } from './use-event-base-path';

/** Hidden on the settings pages themselves — no point linking to where you already are. */
export function EditEventButton() {
  const pathname = usePathname();
  const basePath = useEventBasePath();
  const isSettingsPage =
    pathname === `${basePath}/settings` ||
    pathname.startsWith(`${basePath}/settings/`);

  if (isSettingsPage) return null;

  return (
    <Button asChild variant='outline' size='sm'>
      <Link href={`${basePath}/settings`}>
        <SquarePen aria-hidden data-icon='inline-start' />
        Edit event
      </Link>
    </Button>
  );
}
