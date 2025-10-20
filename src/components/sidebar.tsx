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

import Logo from "@/assets/Logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { SidebarNavigation } from "./sidebarNavigation";
import { getUser } from "@/utils/auth";
import { NavUser } from "./sideBarUser";

/**
 * Server component that renders the application sidebar
 * 
 * @returns JSX element containing the sidebar with logo, navigation, and user profile
 */
export async function AppSidebar() {
  const user = await getUser();

  // This should never happen in practice due to middleware protection
  if (!user) throw new Error("User must exist");

  return (
    <Sidebar>
      <SidebarHeader>
        <Logo className="px-2" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarNavigation />
      </SidebarContent>

      <SidebarFooter>
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
