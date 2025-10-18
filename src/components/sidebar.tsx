import Logo from "@/assets/Logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { SidebarNavigation } from "./sidebarNavigation";

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <Logo className="px-2" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarNavigation />
      </SidebarContent>
    </Sidebar>
  );
}
