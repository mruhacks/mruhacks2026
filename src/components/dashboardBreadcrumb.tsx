"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function toTitle(segment: string) {
  return segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter((s) => s && s !== "dashboard");

  // Example: /dashboard/group/settings → ["group", "settings"]

  const breadcrumbItems = segments.flatMap((segment, i) => {
    const href = "/dashboard/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    const title = toTitle(segment);

    const item = (
      <BreadcrumbItem key={href}>
        {isLast ? (
          <BreadcrumbPage>{title}</BreadcrumbPage>
        ) : (
          <BreadcrumbLink href={href}>{title}</BreadcrumbLink>
        )}
      </BreadcrumbItem>
    );

    return isLast ? [item] : [item, <BreadcrumbSeparator key={`sep-${href}`} className="hidden md:block" />];
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
        </BreadcrumbItem>
        {segments.length > 0 && (
          <BreadcrumbSeparator className="hidden md:block" />
        )}
        {breadcrumbItems}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
