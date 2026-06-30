'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  updateUserRoles,
  updateUserDirectPermissions,
  updateUserProfile,
  adminSetUserPassword,
  getUserDetails,
  type AdminUserRow,
} from '@/app/actions/users';

interface EditUserDialogProps {
  user: AdminUserRow;
  roles: { id: number; slug: string | null }[];
  permissions: { id: number; slug: string; description: string | null }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditUserDialog({
  user,
  roles,
  permissions,
  open,
  onOpenChange,
  onSaved,
}: EditUserDialogProps) {
  const [name, setName] = React.useState(user.name);
  const [emailVerified, setEmailVerified] = React.useState(user.emailVerified);
  const [selectedRoleIds, setSelectedRoleIds] = React.useState<Set<number>>(
    new Set(user.roles.map((r) => r.id)),
  );
  const [selectedPermIds, setSelectedPermIds] = React.useState<Set<number>>(
    new Set(),
  );
  const [newPassword, setNewPassword] = React.useState('');
  const [settingPassword, setSettingPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUserDetails(user.id).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.success && res.data) {
        setName(res.data.name);
        setEmailVerified(res.data.emailVerified);
        setSelectedRoleIds(new Set(res.data.roles.map((r) => r.id)));
        setSelectedPermIds(
          new Set(res.data.directPermissions.map((p) => p.id)),
        );
      } else if (!res.success) {
        toast.error(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update profile details, roles, and direct permission grants for{' '}
            <span className='font-medium'>{user.email}</span>.
          </DialogDescription>
        </DialogHeader>

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
                disabled={loading}
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
                disabled={loading}
              />
              Email verified
            </label>
          </TabsContent>

          <TabsContent value='roles' className='space-y-3 pt-4'>
            <p className='text-muted-foreground text-xs'>
              A user inherits every permission of the roles they hold. Pick zero
              or more.
            </p>
            <div className='max-h-72 space-y-2 overflow-y-auto rounded-md border p-3'>
              {roles.map((r) => (
                <label
                  key={r.id}
                  className='hover:bg-muted/50 flex items-center gap-2 rounded-md p-1 text-sm'
                >
                  <Checkbox
                    checked={selectedRoleIds.has(r.id)}
                    onCheckedChange={(v) =>
                      toggle(setSelectedRoleIds)(r.id, Boolean(v))
                    }
                    disabled={loading}
                  />
                  <span className='font-medium'>{r.slug ?? 'unnamed'}</span>
                </label>
              ))}
              {roles.length === 0 && (
                <div className='text-muted-foreground text-xs'>
                  No roles defined.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value='permissions' className='space-y-3 pt-4'>
            <p className='text-muted-foreground text-xs'>
              Grant ad-hoc permissions beyond what the user’s roles provide. Use
              sparingly — prefer role-based grants.
            </p>
            <div className='max-h-72 space-y-2 overflow-y-auto rounded-md border p-3'>
              {permissions.map((p) => (
                <label
                  key={p.id}
                  className='hover:bg-muted/50 flex items-start gap-2 rounded-md p-1 text-sm'
                >
                  <Checkbox
                    checked={selectedPermIds.has(p.id)}
                    onCheckedChange={(v) =>
                      toggle(setSelectedPermIds)(p.id, Boolean(v))
                    }
                    disabled={loading}
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
              {permissions.length === 0 && (
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

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
