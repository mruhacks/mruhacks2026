import type { ReactNode } from 'react';
import { requireAuthWithPermission } from '@/lib/rbac/guards';

/**
 * Admin section layout. Enforces that the caller has at least ONE of the
 * core admin-capable permissions before rendering any admin page.
 *
 * Individual pages may further narrow this (e.g. user:write:all for actions
 * that mutate users) via requirePermission inside their server actions.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAuthWithPermission([
    'user:read:all',
    'user:all:all',
    'role:read:all',
    'permission:read:all',
    'event:manage:all',
  ]);

  return <div className='space-y-6'>{children}</div>;
}
