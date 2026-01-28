'use client';

import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { authClient } from '@/utils/auth-client';
import { useRouter } from 'next/navigation';

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
}) {
  const initials = getInitials(user.name);
  const router = useRouter();

  const onLogout = async () => {
    await authClient.signOut();
    router.push('/');
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className='hover:bg-sidebar-accent/40 flex w-full items-center justify-between rounded-md px-2 py-1.5 transition'>
          <div className='flex items-center gap-2'>
            <Avatar className='size-8 rounded-lg'>
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className='rounded-lg'>{initials}</AvatarFallback>
            </Avatar>
            <div className='flex flex-col text-left'>
              <span className='text-sm/tight font-medium'>{user.name}</span>
              <span className='text-muted-foreground text-xs'>
                {user.email}
              </span>
            </div>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onLogout}
                  className='text-muted-foreground hover:bg-destructive/10 hover:text-destructive ml-2 rounded-md p-1 transition'
                  aria-label='Log out'
                >
                  <LogOut className='size-4' />
                </button>
              </TooltipTrigger>
              <TooltipContent side='left' align='center'>
                Log out
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : first;
  return (first + last).toUpperCase();
}
