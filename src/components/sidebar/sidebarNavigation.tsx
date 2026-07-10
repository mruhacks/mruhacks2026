import Link from 'next/link';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarContent,
} from '@/components/ui/sidebar';
import {
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  FileCheck,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Scale,
  Settings,
  ShieldCheck,
  User,
  UserCheck,
  Users,
  Users2,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@radix-ui/react-collapsible';
import { getAuthenticatedUserPermissions } from '@/lib/rbac/guards';
import { anyPermissionMatches } from '@/lib/rbac/permissions';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** If set, user must have at least one of these permissions to see this item. */
  requiresAnyPermission?: string[];
}

const adminItems: NavItem[] = [
  {
    title: 'Overview',
    url: '/dashboard/admin',
    icon: LayoutDashboard,
    requiresAnyPermission: [
      'user:read:all',
      'user:all:all',
      'event:manage:all',
      'role:read:all',
      'permission:read:all',
    ],
  },
  {
    title: 'User Management',
    url: '/dashboard/admin/users',
    icon: Users,
    requiresAnyPermission: ['user:read:all', 'user:all:all'],
  },
  {
    title: 'Roles',
    url: '/dashboard/admin/roles',
    icon: ShieldCheck,
    requiresAnyPermission: ['role:read:all', 'role:write:all', 'user:all:all'],
  },
  {
    title: 'Permissions',
    url: '/dashboard/admin/permissions',
    icon: KeyRound,
    requiresAnyPermission: [
      'permission:read:all',
      'permission:write:all',
      'user:all:all',
    ],
  },
  {
    title: 'Events & Meals',
    url: '/dashboard/admin/events',
    icon: Calendar,
    requiresAnyPermission: ['event:manage:all'],
  },
  {
    title: 'Check-In',
    url: '/dashboard/admin/checkin',
    icon: CheckSquare,
    requiresAnyPermission: ['checkin:write:all', 'event:manage:all'],
  },
  {
    title: 'Communications',
    url: '/dashboard/admin/comms',
    icon: MessageSquare,
    requiresAnyPermission: ['event:manage:all'],
  },
  {
    title: 'Support Tickets',
    url: '/dashboard/admin/support',
    icon: LifeBuoy,
    requiresAnyPermission: ['event:manage:all'],
  },
  {
    title: 'Classroom Visits',
    url: '/dashboard/admin/classrooms',
    icon: Building2,
    requiresAnyPermission: ['event:manage:all'],
  },
];

const sections: NavItem[] = [
  { title: 'My Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Profile', url: '/dashboard/profile', icon: User },
  { title: 'Events', url: '/dashboard/events', icon: Calendar },
  { title: 'Team', url: '/dashboard/team', icon: Users2 },
  { title: 'Project', url: '/dashboard/project', icon: FileCheck },
  { title: 'Volunteer', url: '/dashboard/volunteer', icon: UserCheck },
  { title: 'Judge', url: '/dashboard/judge', icon: Scale },
  { title: 'Sponsor', url: '/dashboard/sponsor', icon: Briefcase },
  { title: 'Account & Privacy', url: '/dashboard/account', icon: Settings },
];

function canSee(item: NavItem, permissions: Set<string>): boolean {
  if (!item.requiresAnyPermission || item.requiresAnyPermission.length === 0) {
    return true;
  }
  return item.requiresAnyPermission.some((p) =>
    anyPermissionMatches(permissions, p),
  );
}

export async function SidebarNavigation() {
  const { permissions } = await getAuthenticatedUserPermissions();

  const visibleAdminItems = adminItems.filter((i) => canSee(i, permissions));
  const visibleSections = sections.filter((i) => canSee(i, permissions));

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {visibleSections.map(({ title, url, icon: Icon }) => (
              <SidebarMenuItem key={url}>
                <SidebarMenuButton asChild>
                  <Link href={url}>
                    <Icon className='mr-2 size-4' />
                    {title}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {visibleAdminItems.length > 0 && (
        <Collapsible defaultOpen className='group/collapsible'>
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className='flex items-center'>
                <span>Admin</span>
                <ChevronDown className='ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-180' />
              </CollapsibleTrigger>
            </SidebarGroupLabel>

            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleAdminItems.map(({ title, url, icon: Icon }) => (
                    <SidebarMenuItem key={url}>
                      <SidebarMenuButton asChild>
                        <Link href={url}>
                          <Icon className='mr-2 size-4' />
                          {title}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      )}
    </SidebarContent>
  );
}
