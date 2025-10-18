"use client";

import { usePathname } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import {
  Home,
  ClipboardList,
  Calendar,
  Users,
  FileText,
  Utensils,
  Lightbulb,
  Settings,
} from "lucide-react";

export function SidebarNavigation() {
  const pathname = usePathname();

  const items = [
    {
      title: "Overview",
      url: "/dashboard",
      icon: Home,
    },
    {
      title: "My Registration",
      url: "/dashboard/registration",
      icon: ClipboardList,
    },
    {
      title: "Event Schedule",
      url: "/dashboard/schedule",
      icon: Calendar,
    },
    {
      title: "Meal Ticket",
      url: "/dashboard/meals",
      icon: Utensils,
    },
    {
      title: "Workshops",
      url: "/dashboard/workshops",
      icon: Lightbulb,
    },
    {
      title: "My Group",
      url: "/dashboard/group",
      icon: Users,
    },
    {
      title: "Submissions",
      url: "/dashboard/submissions",
      icon: FileText,
    },
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: Settings,
    },
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Participant Portal</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive =
              pathname === item.url ||
              (pathname?.startsWith(item.url) && item.url !== "/dashboard");

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <a href={item.url} className="flex items-center gap-2">
                    <item.icon
                      className={`size-4 shrink-0 ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
