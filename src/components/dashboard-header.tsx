'use client';

import Link from 'next/link';
import { LogOut, User } from 'lucide-react';
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

const NAV_LINKS = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Profile', href: '/dashboard/profile' },
];

export function DashboardHeader({ user }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await authClient.signOut();
    router.push('/');
  }

  return (
    <header className='border-b bg-white'>
      <div className='mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 sm:px-6'>
        <div className='flex items-center gap-6'>
          <Link href='/dashboard' className='flex items-center gap-2'>
            <Chevron className='h-7 w-auto' />
            <span className='font-semibold tracking-tight'>MRUHacks</span>
          </Link>

          <nav className='hidden items-center gap-1 sm:flex'>
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className={[
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  pathname === href
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className='rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
              <Avatar className='size-8'>
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className='text-xs'>
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-52'>
            <div className='px-2 py-1.5'>
              <p className='text-sm font-medium leading-tight'>{user.name}</p>
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
