import { getUser } from "@/utils/auth";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default async function ForbiddenPage() {
  const user = await getUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="max-w-md text-center shadow-md">
        <CardHeader className="flex flex-col items-center gap-2">
          <ShieldAlert className="h-10 w-10 text-warning" />
          <CardTitle className="text-3xl font-semibold text-warning">
            403 – Forbidden
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          {user ? (
            <>
              <p className="text-muted-foreground">
                You’re signed in as{" "}
                <span className="font-medium">{user.email}</span>, but you don’t
                have permission to view this page.
              </p>
              <Button asChild>
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                You need to be logged in to view this resource.
              </p>
              <div className="flex justify-center gap-2">
                <Button asChild>
                  <Link href="/signin">Sign In</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/">Go Home</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
