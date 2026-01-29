import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export default function ApplyPageLoading() {
  return (
    <Card className="w-full sm:max-w-2xl">
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-6 w-56" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-64 mt-2" />
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form>
          <Tabs value="personal" className="w-full">
            <TabsList className="grid grid-cols-3 mb-6 w-full">
              <TabsTrigger value="personal">Personal Details</TabsTrigger>
              <TabsTrigger value="interests" disabled>
                Interests & Preferences
              </TabsTrigger>
              <TabsTrigger value="consents" disabled>
                Consents & Finalization
              </TabsTrigger>
            </TabsList>

            <TabsContent value="personal">
              <div className="space-y-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                ))}

                <div className="flex items-center gap-3 mt-2">
                  <Skeleton className="h-5 w-5 rounded-sm" />
                  <Skeleton className="h-4 w-64" />
                </div>

                <div className="mt-6 flex justify-end">
                  <Button disabled>
                    <Skeleton className="h-4 w-12" />
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </form>
      </CardContent>
    </Card>
  );
}
