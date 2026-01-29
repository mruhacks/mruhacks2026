import { redirect } from "next/navigation";
import Link from "next/link";

import { getUser } from "@/utils/auth";
import { getEventsWithUserStatus } from "@/app/register/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RegisterEventButton } from "./RegisterEventButton";
import { UnregisterEventButton } from "./UnregisterEventButton";
import { Calendar } from "lucide-react";

function formatDate(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function DashboardEventsPage() {
  const user = await getUser();
  if (!user) redirect("/signin");

  const eventsList = await getEventsWithUserStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Calendar className="h-6 w-6" />
          Events
        </h1>
        <p className="text-muted-foreground mt-1">
          Browse events and apply or register to attend.
        </p>
      </div>

      {eventsList.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No events yet</CardTitle>
            <CardDescription>
              There are no events available at the moment. Check back later.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventsList.map((event) => (
            <li key={event.id}>
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{event.name}</CardTitle>
                  <CardDescription className="text-sm">
                    {event.startsAt && (
                      <span>
                        {formatDate(event.startsAt)}
                        {event.endsAt && ` – ${formatDate(event.endsAt)}`}
                      </span>
                    )}
                    {!event.startsAt && "Date TBA"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-4">
                  {event.hasApplication ? (
                    <Button asChild size="sm" variant="default">
                      <Link href={`/dashboard/register/${event.id}`}>
                        {event.userStatus === "applied"
                          ? "Edit application"
                          : "Apply"}
                      </Link>
                    </Button>
                  ) : (
                    <>
                      {event.userStatus === "registered" ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            You are registered
                          </span>
                          <UnregisterEventButton eventId={event.id} />
                        </div>
                      ) : (
                        <RegisterEventButton eventId={event.id} />
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
