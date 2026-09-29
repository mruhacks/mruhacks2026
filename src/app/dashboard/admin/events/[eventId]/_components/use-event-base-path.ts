'use client';

import { usePathname } from 'next/navigation';

/**
 * `/dashboard/admin/events/<segment>` for the event currently on screen.
 *
 * Read from the URL rather than passed down, because the segment is whichever
 * form the admin arrived with — the event's custom slug or its uuid — and
 * every link built inside the event dashboard should keep that form. Server
 * components have the segment in `params` and don't need this; client
 * components under this route do, and they all sit below the `[eventId]`
 * segment, so it is always the fifth path part.
 */
export function useEventBasePath(): string {
  const pathname = usePathname();
  const segment = pathname.split('/')[4] ?? '';
  return `/dashboard/admin/events/${segment}`;
}
