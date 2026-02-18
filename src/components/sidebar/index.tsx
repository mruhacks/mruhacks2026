/**
 * Application sidebar component
 *
 * Displays the main navigation sidebar for authenticated users in the dashboard.
 * The sidebar includes:
 * - Logo header
 * - Navigation links
 * - User profile footer
 *
 * This is a server component that fetches the current user on the server.
 *
 * @throws Error if user is not authenticated (should be protected by middleware)
 */

import {
  Sidebar,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { SidebarNavigation } from './sidebarNavigation';
import { getUser } from '@/utils/auth';
import { NavUser } from './sideBarUser';
import Chevron from '@/assets/Chevron';
import { LifeBuoy } from 'lucide-react';
import Link from 'next/link';

/**
 * Server component that renders the application sidebar
 *
 * @returns JSX element containing the sidebar with logo, navigation, and user profile
 */
export async function AppSidebar() {
  const user = await getUser();

  // This should never happen in practice due to middleware protection
  if (!user) throw new Error('User must exist');

  return (
    <Sidebar>
      <SidebarHeader>
        <div className='flex h-[60px] flex-row items-center'>
          <Chevron className='h-full w-auto p-0.5' />
          <div>
            <h1 className='font-medium'>MRUHacks</h1>
            <h2>2026</h2>
          </div>
        </div>
      </SidebarHeader>

      <div className='mx-4 border-t' />

      <SidebarNavigation />

      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuButton>
                <LifeBuoy />
                <Link href='/support'>Support</Link>
                <SidebarMenuBadge>2</SidebarMenuBadge>
              </SidebarMenuButton>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavUser
          user={{
            avatar: user.image ?? undefined,
            name: user.name,
            email: user.email,
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
