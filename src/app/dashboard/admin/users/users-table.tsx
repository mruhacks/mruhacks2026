'use client';

import * as React from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from '@tanstack/react-table';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  MoreHorizontal,
  Pencil,
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
import { DataTable } from '@/components/data-table/data-table';
import { DataTableFacetedFilter } from '@/components/data-table/data-table-faceted-filter';
import {
  listUsers,
  deleteUser,
  adminSendPasswordReset,
  adminUnbanUser,
  adminRevokeUserSessions,
  type AdminUserRow,
} from '@/app/actions/users';
import { authClient } from '@/utils/auth-client';
import { useRouter } from 'next/navigation';
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
  currentUserId: string;
  canWrite: boolean;
}

export function UsersTable({
  initialData,
  roles,
  currentUserId,
  canWrite,
}: UsersTableProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const roleFilter = React.useMemo<string[]>(() => {
    const v = columnFilters.find((f) => f.id === 'roles')?.value;
    return Array.isArray(v) ? (v as string[]) : [];
  }, [columnFilters]);
  const roleFilterKey = roleFilter.join(',');
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [banningUser, setBanningUser] = React.useState<AdminUserRow | null>(
    null,
  );

  // Debounce the search box input; only the debounced value feeds the query.
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset to page 1 whenever the filters/sort/pageSize change.
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilterKey, pageSize, sorting]);

  const sortState = sorting[0];
  const sortField =
    (sortState?.id as 'name' | 'email' | 'createdAt' | undefined) ??
    'createdAt';
  const sortDirection = sortState
    ? sortState.desc
      ? ('desc' as const)
      : ('asc' as const)
    : ('desc' as const);

  const queryKey = [
    'users',
    {
      page,
      pageSize,
      search: debouncedSearch,
      roleSlugs: roleFilter,
      sortField,
      sortDirection,
    },
  ] as const;

  const { data = initialData, isFetching: loading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await listUsers({
        page,
        pageSize,
        search: debouncedSearch,
        roleSlugs: roleFilter,
        sortField,
        sortDirection,
      });
      if (!res.success || !res.data) {
        throw new Error(res.success ? 'No data' : res.error);
      }
      return res.data;
    },
    placeholderData: keepPreviousData,
    initialData:
      page === initialData.page &&
      pageSize === initialData.pageSize &&
      debouncedSearch === '' &&
      roleFilter.length === 0 &&
      sortField === 'createdAt' &&
      sortDirection === 'desc'
        ? initialData
        : undefined,
  });

  React.useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const invalidateUsers = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    [queryClient],
  );

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
      invalidateUsers();
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
      invalidateUsers();
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
        filterFn: () => true, // filtering runs server-side via listUsers
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
                <DropdownMenuItem
                  onSelect={() =>
                    router.push(`/dashboard/admin/users/${u.id}`)
                  }
                >
                  <Pencil className='size-4' />
                  Edit user
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
        onColumnFiltersChange={setColumnFilters}
        emptyMessage={loading ? 'Loading…' : 'No users match these filters.'}
        toolbar={
          <input
            type='search'
            placeholder='Search name or email…'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-64 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]'
          />
        }
        toolbarRight={(table) => (
          <DataTableFacetedFilter
            column={table.getColumn('roles')}
            title='Roles'
            options={roles
              .filter((r): r is { id: number; slug: string } =>
                Boolean(r.slug),
              )
              .map((r) => ({ label: r.slug, value: r.slug }))}
          />
        )}
      />

      {banningUser && (
        <BanUserDialog
          user={banningUser}
          open={!!banningUser}
          onOpenChange={(open) => {
            if (!open) setBanningUser(null);
          }}
          onBanned={() => {
            setBanningUser(null);
            invalidateUsers();
          }}
        />
      )}
    </>
  );
}
