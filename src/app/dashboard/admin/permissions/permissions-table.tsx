'use client';

import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/data-table/data-table';
import {
  addPermission,
  updatePermission,
  deletePermission,
  listPermissions,
  type PermissionRow,
} from '@/app/actions/roles';

interface PermissionsTableProps {
  initialPermissions: PermissionRow[];
  canWrite: boolean;
}

export function PermissionsTable({
  initialPermissions,
  canWrite,
}: PermissionsTableProps) {
  const [rows, setRows] = React.useState(initialPermissions);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<PermissionRow | null>(null);

  const refetch = async () => {
    const res = await listPermissions();
    if (res.success && res.data) setRows(res.data);
  };

  const handleDelete = async (p: PermissionRow) => {
    const ok = window.confirm(
      `Delete permission "${p.slug}"? This will revoke it from every role and user.`,
    );
    if (!ok) return;
    const res = await deletePermission(p.id);
    if (res.success) {
      toast.success('Permission deleted');
      refetch();
    } else toast.error(res.error);
  };

  const columns = React.useMemo<ColumnDef<PermissionRow>[]>(
    () => [
      {
        accessorKey: 'slug',
        header: 'Slug',
        cell: ({ row }) => (
          <span className='font-mono font-medium'>{row.original.slug}</span>
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
        searchPlaceholder='Search permissions…'
        emptyMessage='No permissions defined.'
        toolbarRight={() =>
          canWrite ? (
            <Button size='sm' onClick={() => setCreating(true)}>
              <Plus className='size-4' /> New permission
            </Button>
          ) : null
        }
      />

      {creating && (
        <PermissionEditorDialog
          mode='create'
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refetch();
          }}
        />
      )}
      {editing && (
        <PermissionEditorDialog
          mode='edit'
          permission={editing}
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

interface PermissionEditorDialogProps {
  mode: 'create' | 'edit';
  permission?: PermissionRow;
  onClose: () => void;
  onSaved: () => void;
}

function PermissionEditorDialog({
  mode,
  permission,
  onClose,
  onSaved,
}: PermissionEditorDialogProps) {
  const [slug, setSlug] = React.useState(permission?.slug ?? '');
  const [description, setDescription] = React.useState(
    permission?.description ?? '',
  );
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    if (!slug.trim()) {
      toast.error('Slug is required');
      return;
    }
    setSaving(true);
    if (mode === 'create') {
      const res = await addPermission(
        slug.trim().toLowerCase(),
        description || undefined,
      );
      setSaving(false);
      if (!res.success) return toast.error(res.error);
    } else if (permission) {
      const res = await updatePermission(permission.id, {
        slug: slug.trim().toLowerCase(),
        description: description || null,
      });
      setSaving(false);
      if (!res.success) return toast.error(res.error);
    }
    toast.success(
      mode === 'create' ? 'Permission created' : 'Permission updated',
    );
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? 'Create permission'
              : `Edit permission "${permission?.slug}"`}
          </DialogTitle>
          <DialogDescription>
            Permissions follow the <code>entity:action:scope</code> pattern. Use{' '}
            <code>all</code> in any segment as a wildcard.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='perm-slug'>Slug</Label>
            <Input
              id='perm-slug'
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder='e.g. submission:read:all'
              className='font-mono'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='perm-description'>Description</Label>
            <Input
              id='perm-description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
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
