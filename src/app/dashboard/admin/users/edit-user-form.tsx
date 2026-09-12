'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import {
  updateUserRoles,
  updateUserDirectPermissions,
  updateUserProfile,
  adminSetUserPassword,
} from '@/app/actions/users';

export interface EditUserFormData {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  roles: { id: number; slug: string | null }[];
  directPermissions: { id: number; slug: string; description: string | null }[];
}

interface EditUserFormProps {
  user: EditUserFormData;
  allRoles: { id: number; slug: string | null }[];
  allPermissions: { id: number; slug: string; description: string | null }[];
  onSaved: () => void;
  footer?: React.ReactNode;
}

export function EditUserForm({
  user,
  allRoles,
  allPermissions,
  onSaved,
  footer,
}: EditUserFormProps) {
  const [name, setName] = React.useState(user.name);
  const [emailVerified, setEmailVerified] = React.useState(user.emailVerified);
  const [selectedRoleIds, setSelectedRoleIds] = React.useState<Set<number>>(
    new Set(user.roles.map((r) => r.id)),
  );
  const [selectedPermIds, setSelectedPermIds] = React.useState<Set<number>>(
    new Set(user.directPermissions.map((p) => p.id)),
  );
  const [newPassword, setNewPassword] = React.useState('');
  const [settingPassword, setSettingPassword] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const toggle =
    (setter: React.Dispatch<React.SetStateAction<Set<number>>>) =>
    (id: number, checked: boolean) => {
      setter((prev) => {
        const next = new Set(prev);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      });
    };

  const handleSave = async () => {
    setSaving(true);
    const profileRes = await updateUserProfile(user.id, {
      name,
      emailVerified,
    });
    if (!profileRes.success) {
      setSaving(false);
      toast.error(profileRes.error);
      return;
    }
    const rolesRes = await updateUserRoles(
      user.id,
      Array.from(selectedRoleIds),
    );
    if (!rolesRes.success) {
      setSaving(false);
      toast.error(rolesRes.error);
      return;
    }
    const permsRes = await updateUserDirectPermissions(
      user.id,
      Array.from(selectedPermIds),
    );
    setSaving(false);
    if (!permsRes.success) {
      toast.error(permsRes.error);
      return;
    }
    toast.success('User updated');
    onSaved();
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSettingPassword(true);
    const res = await adminSetUserPassword(user.id, newPassword);
    setSettingPassword(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success('Password updated');
    setNewPassword('');
  };

  return (
    <div className='space-y-4'>
      <Tabs defaultValue='profile' className='w-full'>
        <TabsList className='grid w-full grid-cols-4'>
          <TabsTrigger value='profile'>Profile</TabsTrigger>
          <TabsTrigger value='roles'>Roles</TabsTrigger>
          <TabsTrigger value='permissions'>Direct perms</TabsTrigger>
          <TabsTrigger value='password'>Password</TabsTrigger>
        </TabsList>

        <TabsContent value='profile' className='space-y-4 pt-4'>
          <div className='space-y-2'>
            <Label htmlFor='edit-user-name'>Name</Label>
            <Input
              id='edit-user-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>Email</Label>
            <Input value={user.email} disabled />
          </div>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={emailVerified}
              onCheckedChange={(v) => setEmailVerified(Boolean(v))}
            />
            Email verified
          </label>
        </TabsContent>

        <TabsContent value='roles' className='space-y-3 pt-4'>
          <p className='text-muted-foreground text-xs'>
            A user inherits every permission of the roles they hold.
          </p>
          <div className='max-h-72 space-y-2 overflow-y-auto rounded-md border p-3'>
            {allRoles.map((r) => (
              <label
                key={r.id}
                className='hover:bg-muted/50 flex items-center gap-2 rounded-md p-1 text-sm'
              >
                <Checkbox
                  checked={selectedRoleIds.has(r.id)}
                  onCheckedChange={(v) =>
                    toggle(setSelectedRoleIds)(r.id, Boolean(v))
                  }
                />
                <span className='font-medium'>{r.slug ?? 'unnamed'}</span>
              </label>
            ))}
            {allRoles.length === 0 && (
              <div className='text-muted-foreground text-xs'>
                No roles defined.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value='permissions' className='space-y-3 pt-4'>
          <p className='text-muted-foreground text-xs'>
            Grant ad-hoc permissions beyond what the user&apos;s roles provide.
            Prefer role-based grants.
          </p>
          <div className='max-h-72 space-y-2 overflow-y-auto rounded-md border p-3'>
            {allPermissions.map((p) => (
              <label
                key={p.id}
                className='hover:bg-muted/50 flex items-start gap-2 rounded-md p-1 text-sm'
              >
                <Checkbox
                  checked={selectedPermIds.has(p.id)}
                  onCheckedChange={(v) =>
                    toggle(setSelectedPermIds)(p.id, Boolean(v))
                  }
                  className='mt-0.5'
                />
                <span>
                  <span className='font-mono font-medium'>{p.slug}</span>
                  {p.description && (
                    <span className='text-muted-foreground block text-xs'>
                      {p.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {allPermissions.length === 0 && (
              <div className='text-muted-foreground text-xs'>
                No permissions defined.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value='password' className='space-y-4 pt-4'>
          <p className='text-muted-foreground text-xs'>
            Set a new password directly for this user. The change takes effect
            immediately.
          </p>
          <div className='space-y-2'>
            <Label htmlFor='edit-user-password'>New password</Label>
            <Input
              id='edit-user-password'
              type='password'
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder='Min. 8 characters'
            />
          </div>
          <Button
            onClick={handleSetPassword}
            disabled={settingPassword || newPassword.length === 0}
            size='sm'
          >
            {settingPassword ? 'Saving…' : 'Set password'}
          </Button>
        </TabsContent>
      </Tabs>

      <div className='flex justify-end gap-2 border-t pt-4'>
        {footer}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </div>
  );
}
