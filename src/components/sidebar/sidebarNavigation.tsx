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
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Scale,
  UserCheck,
  Users,
  Users2,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@radix-ui/react-collapsible';

const adminItems = [
  { title: 'Overview', url: '/dashboard/admin', icon: LayoutDashboard },
  {
    title: 'Events & Meals',
    url: '/dashboard/admin/events-meals',
    icon: Calendar,
  },
  { title: 'Check-In', url: '/dashboard/admin/checkin', icon: CheckSquare },
  { title: 'User Management', url: '/dashboard/admin/users', icon: Users },
  {
    title: 'Communications',
    url: '/dashboard/admin/comms',
    icon: MessageSquare,
  },
  { title: 'Support Tickets', url: '/dashboard/admin/support', icon: LifeBuoy },
  {
    title: 'Classroom Visits',
    url: '/dashboard/admin/classrooms',
    icon: Building2,
  },
];

const sections = [
  { title: 'My Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Team', url: '/dashboard/team', icon: Users2 },
  { title: 'Project', url: '/dashboard/project', icon: FileCheck },
  { title: 'Volunteer', url: '/dashboard/volunteer', icon: UserCheck },
  { title: 'Judge', url: '/dashboard/judge', icon: Scale },
  { title: 'Sponsor', url: '/dashboard/sponsor', icon: Briefcase },
];

export function SidebarNavigation() {
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {sections.map(({ title, url, icon: Icon }) => (
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
                {adminItems.map(({ title, url, icon: Icon }) => (
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
    </SidebarContent>
  );
}
