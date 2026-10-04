'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EditUserForm, type EditUserFormData } from './edit-user-form';

interface EditUserModalClientProps {
  user: EditUserFormData;
  /** Null when the viewer can't read roles: the Roles tab is hidden. */
  allRoles: { id: number; slug: string | null }[] | null;
  /** Null when the viewer can't read permissions: that tab is hidden. */
  allPermissions:
    | { id: number; slug: string; description: string | null }[]
    | null;
}

export function EditUserModalClient({
  user,
  allRoles,
  allPermissions,
}: EditUserModalClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const close = () => router.back();

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    router.back();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update profile details, roles, and direct permission grants for{' '}
            <span className='font-medium'>{user.email}</span>.
          </DialogDescription>
        </DialogHeader>
        <EditUserForm
          user={user}
          allRoles={allRoles}
          allPermissions={allPermissions}
          onSaved={handleSaved}
          footer={
            <Button variant='outline' onClick={close}>
              Cancel
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
