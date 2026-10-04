import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getUser } from '@/utils/auth';

/**
 * Admin section layout. Only requires a session: every page under here gates
 * itself on the permission behind its own feature. A shared "admin-ish" list
 * here would lock out staff whose one permission isn't on it, such as a
 * check-in volunteer holding only `checkin:write:all` (see AGENTS.md).
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!(await getUser())) redirect('/signin');

  return <div className='space-y-6'>{children}</div>;
}
