import { notFound } from 'next/navigation';

import { getUserDetails } from '@/app/actions/users';
import { listRoles, listPermissions } from '@/app/actions/roles';
import { EditUserModalClient } from '../../edit-user-modal-client';

export default async function InterceptedUserEditPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const [userRes, rolesRes, permsRes] = await Promise.all([
    getUserDetails(userId),
    listRoles(),
    listPermissions(),
  ]);

  if (!userRes.success || !userRes.data) notFound();

  const { id, name, email, emailVerified, roles, directPermissions } =
    userRes.data;

  const allRoles =
    rolesRes.success && rolesRes.data
      ? rolesRes.data.map((r) => ({ id: r.id, slug: r.slug }))
      : [];
  const allPermissions = permsRes.success && permsRes.data ? permsRes.data : [];

  return (
    <EditUserModalClient
      user={{ id, name, email, emailVerified, roles, directPermissions }}
      allRoles={allRoles}
      allPermissions={allPermissions}
    />
  );
}
