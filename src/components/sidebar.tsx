import Logo from "@/assets/Logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { SidebarNavigation } from "./sidebarNavigation";
import { getUser } from "@/utils/auth";
import { Avatar } from "./ui/avatar";
import { AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { assert } from "console";
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : first;

  return (first + last).toUpperCase();
}
