'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/data-table/data-table';
import {
  createRole,
  updateRole,
  deleteRole,
  setRolePermissions,
  listRoles,
  type RoleWithCounts,
} from '@/app/actions/roles';
import { getRolePermissions } from '@/app/actions/authz';

interface RolesTableProps {
  initialRoles: RoleWithCounts[];
  permissions: { id: number; slug: string; description: string | null }[];
  canWrite: boolean;
}

export function RolesTable({
  initialRoles,
  permissions,
  canWrite,
}: RolesTableProps) {
  const [rows, setRows] = React.useState(initialRoles);
  const [editing, setEditing] = React.useState<RoleWithCounts | null>(null);
  const [creating, setCreating] = React.useState(false);

  const refetch = async () => {
    const res = await listRoles();
    if (res.success && res.data) setRows(res.data);
  };

  const handleDelete = async (r: RoleWithCounts) => {
    const ok = window.confirm(
      `Delete role "${r.slug}"? This will remove it from ${r.userCount} user(s).`,
    );
    if (!ok) return;
    const res = await deleteRole(r.id);
    if (res.success) {
      toast.success('Role deleted');
      refetch();
    } else toast.error(res.error);
  };

  const columns = React.useMemo<ColumnDef<RoleWithCounts>[]>(
    () => [
      {
        accessorKey: 'slug',
        header: 'Slug',
        cell: ({ row }) => (
          <span className='font-mono font-medium'>
            {row.original.slug ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.description ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'permissionCount',
        header: 'Permissions',
        cell: ({ row }) => (
          <Badge variant='secondary'>{row.original.permissionCount}</Badge>
        ),
      },
      {
        accessorKey: 'userCount',
        header: 'Users',
        cell: ({ row }) => (
          <Badge variant='outline'>{row.original.userCount}</Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          if (!canWrite) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon-sm'>
                  <MoreHorizontal className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onSelect={() => setEditing(row.original)}>
                  <Pencil className='size-4' /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant='destructive'
                  onSelect={() => handleDelete(row.original)}
                >
                  <Trash2 className='size-4' /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder='Search roles…'
        toolbarRight={() =>
          canWrite ? (
            <Button size='sm' onClick={() => setCreating(true)}>
              <Plus className='size-4' /> New role
            </Button>
          ) : null
        }
        emptyMessage='No roles defined.'
      />

      {creating && (
        <RoleEditorDialog
          mode='create'
          permissions={permissions}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refetch();
          }}
        />
      )}
      {editing && (
        <RoleEditorDialog
          mode='edit'
          role={editing}
          permissions={permissions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </>
  );
}

interface RoleEditorDialogProps {
  mode: 'create' | 'edit';
  role?: RoleWithCounts;
  permissions: { id: number; slug: string; description: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}

function RoleEditorDialog({
  mode,
  role,
  permissions,
  onClose,
  onSaved,
}: RoleEditorDialogProps) {
  const [slug, setSlug] = React.useState(role?.slug ?? '');
  const [description, setDescription] = React.useState(role?.description ?? '');
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (mode === 'edit' && role) {
      getRolePermissions(role.id).then((res) => {
        if (res.success && res.data) {
          setSelected(new Set(res.data.map((p) => p.id)));
        }
      });
    }
  }, [mode, role]);

  const toggle = (id: number, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!slug.trim()) {
      toast.error('Slug is required');
      return;
    }
    setSaving(true);
    let roleId = role?.id;
    if (mode === 'create') {
      const res = await createRole(
        slug.trim().toLowerCase(),
        description || undefined,
      );
      if (!res.success) {
        setSaving(false);
        toast.error(res.error);
        return;
      }
      roleId = res.data;
    } else if (role) {
      const res = await updateRole(role.id, {
        slug: slug.trim().toLowerCase(),
        description: description || null,
      });
      if (!res.success) {
        setSaving(false);
        toast.error(res.error);
        return;
      }
    }
    if (roleId) {
      const permsRes = await setRolePermissions(roleId, Array.from(selected));
      if (!permsRes.success) {
        setSaving(false);
        toast.error(permsRes.error);
        return;
      }
    }
    setSaving(false);
    toast.success(mode === 'create' ? 'Role created' : 'Role updated');
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create role' : `Edit role "${role?.slug}"`}
          </DialogTitle>
          <DialogDescription>
            Roles bundle permissions so you can assign them to many users at
            once.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='role-slug'>Slug</Label>
            <Input
              id='role-slug'
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder='e.g. judge'
            />
            <p className='text-muted-foreground text-xs'>
              Lowercase identifier. Used in code and URLs.
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='role-description'>Description</Label>
            <Input
              id='role-description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='What does this role do?'
            />
          </div>
          <div className='space-y-2'>
            <Label>Permissions</Label>
            <div className='max-h-60 space-y-2 overflow-y-auto rounded-md border p-3'>
              {permissions.map((p) => (
                <label
                  key={p.id}
                  className='hover:bg-muted/50 flex items-start gap-2 rounded-md p-1 text-sm'
                >
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(v) => toggle(p.id, Boolean(v))}
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
                  No permissions defined yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
