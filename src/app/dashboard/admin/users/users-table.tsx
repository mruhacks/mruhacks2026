'use client';

import * as React from 'react';
import { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  MoreHorizontal,
  ShieldCheck,
  Trash2,
  Mail,
  UserCheck,
  Ban,
  ShieldOff,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/data-table/data-table';
import {
  listUsers,
  deleteUser,
  adminSendPasswordReset,
  adminUnbanUser,
  adminRevokeUserSessions,
  type AdminUserRow,
} from '@/app/actions/users';
import { authClient } from '@/utils/auth-client';
import { EditUserDialog } from './edit-user-dialog';
import { BanUserDialog } from './ban-user-dialog';

interface UsersTableProps {
  initialData: {
    users: AdminUserRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  roles: { id: number; slug: string | null }[];
  permissions: { id: number; slug: string; description: string | null }[];
  currentUserId: string;
  canWrite: boolean;
}

export function UsersTable({
  initialData,
  roles,
  permissions,
  currentUserId,
  canWrite,
}: UsersTableProps) {
  const [data, setData] = React.useState(initialData);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('');
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [editingUser, setEditingUser] = React.useState<AdminUserRow | null>(
    null,
  );
  const [banningUser, setBanningUser] = React.useState<AdminUserRow | null>(
    null,
  );

  const refetch = React.useCallback(
    async (
      overrides: Partial<{
        page: number;
        pageSize: number;
        search: string;
        roleSlug: string;
        sortField: 'name' | 'email' | 'createdAt';
        sortDirection: 'asc' | 'desc';
      }> = {},
    ) => {
      setLoading(true);
      const sortState = sorting[0];
      const sortField =
        overrides.sortField ??
        (sortState?.id as 'name' | 'email' | 'createdAt' | undefined) ??
        'createdAt';
      const sortDirection =
        overrides.sortDirection ??
        (sortState ? (sortState.desc ? 'desc' : 'asc') : 'desc');
      const res = await listUsers({
        page: overrides.page ?? page,
        pageSize: overrides.pageSize ?? pageSize,
        search: overrides.search ?? search,
        roleSlug: overrides.roleSlug ?? roleFilter ?? undefined,
        sortField,
        sortDirection,
      });
      setLoading(false);
      if (res.success && res.data) {
        setData(res.data);
      } else if (!res.success) {
        toast.error(res.error);
      }
    },
    [page, pageSize, search, roleFilter, sorting],
  );

  // Debounce search
  React.useEffect(() => {
    const id = setTimeout(() => {
      setPage(1);
      refetch({ page: 1, search });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  React.useEffect(() => {
    setPage(1);
    refetch({ page: 1, roleSlug: roleFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  React.useEffect(() => {
    refetch({ page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  React.useEffect(() => {
    refetch({ pageSize, page: 1 });
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  React.useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting]);

  const handleSendPasswordReset = async (row: AdminUserRow) => {
    const res = await adminSendPasswordReset(row.email);
    if (res.success) {
      toast.success(`Password reset email sent to ${row.email}`);
    } else {
      toast.error(res.error);
    }
  };

  const handleImpersonate = async (row: AdminUserRow) => {
    const res = await authClient.admin.impersonateUser({ userId: row.id });
    if (res.error) {
      toast.error(res.error.message ?? 'Failed to impersonate user');
      return;
    }
    window.location.href = '/dashboard';
  };

  const handleUnban = async (row: AdminUserRow) => {
    const res = await adminUnbanUser(row.id);
    if (res.success) {
      toast.success(`Unbanned ${row.email}`);
      refetch();
    } else {
      toast.error(res.error);
    }
  };

  const handleRevokeSessions = async (row: AdminUserRow) => {
    const ok = window.confirm(
      `Revoke all active sessions for "${row.email}"? They will need to sign in again.`,
    );
    if (!ok) return;
    const res = await adminRevokeUserSessions(row.id);
    if (res.success) {
      toast.success(`Revoked sessions for ${row.email}`);
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async (row: AdminUserRow) => {
    if (row.id === currentUserId) {
      toast.error('You cannot delete your own account');
      return;
    }
    const ok = window.confirm(
      `Delete user "${row.email}"? This cannot be undone.`,
    );
    if (!ok) return;
    const res = await deleteUser(row.id);
    if (res.success) {
      toast.success('User deleted');
      refetch();
    } else {
      toast.error(res.error);
    }
  };

  const columns = React.useMemo<ColumnDef<AdminUserRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        enableSorting: true,
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className='flex items-center gap-3'>
              {u.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.image}
                  alt=''
                  width={32}
                  height={32}
                  className='rounded-full'
                />
              ) : (
                <div className='bg-muted flex size-8 items-center justify-center rounded-full text-xs font-medium'>
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <div className='font-medium'>{u.name}</div>
                <div className='text-muted-foreground text-xs'>
                  {u.id === currentUserId && 'you · '}
                  {u.id.slice(0, 8)}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'email',
        header: 'Email',
        enableSorting: true,
        cell: ({ row }) => (
          <div className='flex items-center gap-2'>
            <span>{row.original.email}</span>
            {row.original.emailVerified ? (
              <Badge variant='success'>verified</Badge>
            ) : (
              <Badge variant='warning'>unverified</Badge>
            )}
            {row.original.banned && (
              <Badge variant='destructive' title={row.original.banReason ?? undefined}>
                banned
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'roles',
        header: 'Roles',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.roles.length === 0 ? (
            <span className='text-muted-foreground text-xs'>—</span>
          ) : (
            <div className='flex flex-wrap gap-1'>
              {row.original.roles.map((r) => (
                <Badge
                  key={r.id}
                  variant={r.slug === 'admin' ? 'default' : 'secondary'}
                >
                  {r.slug}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Joined',
        enableSorting: true,
        cell: ({ row }) =>
          new Date(row.original.createdAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          if (!canWrite) return null;
          const u = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon-sm'>
                  <MoreHorizontal className='size-4' />
                  <span className='sr-only'>Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                <DropdownMenuLabel>User actions</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setEditingUser(u)}>
                  <ShieldCheck className='size-4' />
                  Manage roles & permissions
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleSendPasswordReset(u)}>
                  <Mail className='size-4' />
                  Send password reset
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={u.id === currentUserId}
                  onSelect={() => handleImpersonate(u)}
                >
                  <UserCheck className='size-4' />
                  Impersonate
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleRevokeSessions(u)}>
                  <LogOut className='size-4' />
                  Revoke all sessions
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {u.banned ? (
                  <DropdownMenuItem onSelect={() => handleUnban(u)}>
                    <ShieldOff className='size-4' />
                    Unban user
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={u.id === currentUserId}
                    onSelect={() => setBanningUser(u)}
                  >
                    <Ban className='size-4' />
                    Ban user
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  variant='destructive'
                  disabled={u.id === currentUserId}
                  onSelect={() => handleDelete(u)}
                >
                  <Trash2 className='size-4' />
                  Delete user
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserId, canWrite],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data.users}
        searchPlaceholder={null}
        enableColumnVisibility
        manualPagination
        pageIndex={page - 1}
        pageSize={pageSize}
        pageCount={data.totalPages}
        totalRows={data.total}
        onPageChange={(i) => setPage(i + 1)}
        onPageSizeChange={(s) => setPageSize(s)}
        onSortingChange={setSorting}
        initialSorting={sorting}
        emptyMessage={loading ? 'Loading…' : 'No users match these filters.'}
        toolbar={
          <>
            <input
              type='search'
              placeholder='Search name or email…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-64 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]'
            />
            <Select
              value={roleFilter || 'all'}
              onValueChange={(v) => setRoleFilter(v === 'all' ? '' : v)}
            >
              <SelectTrigger className='h-9 w-44'>
                <SelectValue placeholder='All roles' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All roles</SelectItem>
                {roles
                  .filter((r) => Boolean(r.slug))
                  .map((r) => (
                    <SelectItem key={r.id} value={r.slug!}>
                      {r.slug}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          roles={roles}
          permissions={permissions}
          open={!!editingUser}
          onOpenChange={(open) => {
            if (!open) setEditingUser(null);
          }}
          onSaved={() => {
            setEditingUser(null);
            refetch();
          }}
        />
      )}

      {banningUser && (
        <BanUserDialog
          user={banningUser}
          open={!!banningUser}
          onOpenChange={(open) => {
            if (!open) setBanningUser(null);
          }}
          onBanned={() => {
            setBanningUser(null);
            refetch();
          }}
        />
      )}
    </>
  );
}
