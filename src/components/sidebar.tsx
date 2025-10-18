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

export async function AppSidebar() {
  const user = await getUser();

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
