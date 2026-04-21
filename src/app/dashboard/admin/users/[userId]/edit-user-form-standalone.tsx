'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EditUserForm, type EditUserFormData } from '../edit-user-form';

interface EditUserFormStandaloneProps {
  user: EditUserFormData;
  allRoles: { id: number; slug: string | null }[];
  allPermissions: { id: number; slug: string; description: string | null }[];
}

export function EditUserFormStandalone({
  user,
  allRoles,
  allPermissions,
}: EditUserFormStandaloneProps) {
  const router = useRouter();

  const handleSaved = () => {
    router.push('/dashboard/admin/users');
  };

  return (
    <EditUserForm
      user={user}
      allRoles={allRoles}
      allPermissions={allPermissions}
      onSaved={handleSaved}
      footer={
        <Button
          variant='outline'
          onClick={() => router.push('/dashboard/admin/users')}
        >
          Cancel
        </Button>
      }
    />
  );
}
