'use client';

import Link from 'next/link';
import { LogOut, Settings, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/utils/auth-client';
import { usePathname, useRouter } from 'next/navigation';
import Chevron from '@/assets/Chevron';
import { useBreadcrumbContext } from '@/components/breadcrumb-context';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : first;
  return (first + last).toUpperCase();
}

type Props = {
  user: { name: string; email: string; avatar?: string };
};

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  profile: 'Profile',
  account: 'Account & Privacy',
  events: 'Events',
  admin: 'Admin',
  users: 'Users',
  roles: 'Roles',
  permissions: 'Permissions',
  register: 'Register',
  apply: 'Apply',
};

function buildBreadcrumbs(
  pathname: string,
  dynamicSegments: Record<string, string>,
) {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  let path = '';
  for (const segment of segments) {
    path += '/' + segment;
    const label = SEGMENT_LABELS[segment] ?? dynamicSegments[segment];
    if (label) crumbs.push({ label, href: path });
  }
  return crumbs;
}

export function DashboardHeader({ user }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { segments: dynamicSegments } = useBreadcrumbContext();

  async function handleLogout() {
    await authClient.signOut();
    router.push('/');
  }

  return (
    <header
      style={{
        borderBottom: 'var(--border-hairline)',
        position: 'sticky',
        top: 0,
        background: 'var(--white)',
        zIndex: 20,
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div
        className='mx-auto flex w-full items-center justify-between p-4 sm:px-6'
        style={{ maxWidth: 'var(--content-max)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            href='/'
            className='flex items-center gap-2'
            aria-label='MRUHacks home'
          >
            <Chevron className='h-7 w-auto' />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 'var(--fw-semibold)',
                fontSize: '16px',
                letterSpacing: 'var(--track-display)',
              }}
            >
              MRUHacks
            </span>
          </Link>

          <nav
            className='hidden sm:flex'
            aria-label='Breadcrumb'
            style={{ alignItems: 'center', gap: '0' }}
          >
            {buildBreadcrumbs(pathname, dynamicSegments).map(
              (crumb, i, arr) => {
                const isLast = i === arr.length - 1;
                return (
                  <span
                    key={crumb.href}
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontWeight: 'var(--fw-normal)',
                        fontSize: '15px',
                        color: 'var(--ink-400)',
                        padding: '0 6px',
                      }}
                      aria-hidden
                    >
                      /
                    </span>
                    {isLast ? (
                      <span
                        style={{
                          fontFamily: 'var(--font-ui)',
                          fontWeight: 'var(--fw-semibold)',
                          fontSize: '15px',
                          letterSpacing: 'var(--track-ui)',
                          color: 'var(--black)',
                        }}
                        aria-current='page'
                      >
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        href={crumb.href}
                        style={{
                          fontFamily: 'var(--font-ui)',
                          fontWeight: 'var(--fw-semibold)',
                          fontSize: '15px',
                          letterSpacing: 'var(--track-ui)',
                          color: 'var(--ink-500)',
                          textDecoration: 'none',
                        }}
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </span>
                );
              },
            )}
          </nav>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--gradient-brand)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-ui)',
                fontWeight: 'var(--fw-extrabold)',
                fontSize: '14px',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              aria-label='Account menu'
            >
              {user.avatar ? (
                <Avatar className='size-full'>
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback
                    style={{
                      background: 'transparent',
                      fontSize: '14px',
                      fontWeight: 'var(--fw-extrabold)',
                    }}
                  >
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              ) : (
                getInitials(user.name)
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-52'>
            <div className='px-2 py-1.5'>
              <p className='text-sm leading-tight font-medium'>{user.name}</p>
              <p className='text-muted-foreground truncate text-xs'>
                {user.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href='/dashboard/profile'>
                <User className='mr-2 size-4' />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href='/dashboard/account'>
                <Settings className='mr-2 size-4' />
                Account &amp; Privacy
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className='text-destructive focus:text-destructive'
            >
              <LogOut className='mr-2 size-4' />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
