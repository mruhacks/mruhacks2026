import { notFound } from 'next/navigation';

import { getUserDetails } from '@/app/actions/users';
import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { loadAssignableGrants } from '../../assignable-grants';
import { EditUserModalClient } from '../../edit-user-modal-client';

export default async function InterceptedUserEditPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  // Same gate as the full-page /users/[userId] this intercepts: it's an
  // edit form, so reading users isn't enough.
  const caller = await requireAuthWithPermission([
    'user:write:all',
    'user:all:all',
  ]);

  const [userRes, { allRoles, allPermissions }] = await Promise.all([
    getUserDetails(userId),
    loadAssignableGrants(caller.id),
  ]);

  if (!userRes.success || !userRes.data) notFound();

  const { id, name, email, emailVerified, roles, directPermissions } =
    userRes.data;

  return (
    <EditUserModalClient
      user={{ id, name, email, emailVerified, roles, directPermissions }}
      allRoles={allRoles}
      allPermissions={allPermissions}
    />
  );
}
