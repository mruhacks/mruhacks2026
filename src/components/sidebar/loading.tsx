import { Sidebar, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex flex-row items-center h-[60px] space-x-3">
          <div className="h-10 w-10 bg-muted rounded-md animate-pulse" />
          <div>
            <Skeleton className="h-4 w-24 mb-1" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      </SidebarHeader>

      <div className="border-t mx-4" />

      {/* Navigation skeleton */}
      <div className="flex flex-col px-4 py-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>

      <SidebarFooter>
        {/* User info skeleton */}
        <div className="flex items-center gap-3 p-4">
          <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
          <div className="flex flex-col">
            <Skeleton className="h-4 w-24 mb-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
