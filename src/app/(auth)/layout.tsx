"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabsContent } from "@radix-ui/react-tabs";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeTab = pathname.includes("signup") ? "signup" : "signin";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <Tabs value={activeTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="signin"
              asChild
              className={activeTab === "signin" ? "data-[state=active]" : ""}
            >
              <Link href="/signin">Sign In</Link>
            </TabsTrigger>
            <TabsTrigger
              value="signup"
              asChild
              className={activeTab === "signup" ? "data-[state=active]" : ""}
            >
              <Link href="/signup">Sign Up</Link>
            </TabsTrigger>
          </TabsList>

          {children}
        </Tabs>
      </div>
    </div>
  );
}
