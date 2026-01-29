import { redirect, notFound } from "next/navigation";

import { getUser } from "@/utils/auth";
import {
  getOptions,
  getPreviousFormSubmission,
  registerParticipant,
} from "../actions";
import { db } from "@/utils/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import RegistrationForm from "@/components/registration-form";

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function RegisterEventPage({ params }: Props) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) redirect("/login");

  const [eventRows] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  const event = eventRows;
  if (!event) notFound();
  if (!event.hasApplication) {
    return (
      <Card className="w-full sm:max-w-2xl">
        <CardHeader>
          <CardTitle>No application required</CardTitle>
          <CardDescription>
            This event does not have an application. You can register to attend
            from the event page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [previousRegistration, options] = await Promise.all([
    getPreviousFormSubmission(eventId),
    getOptions(),
  ]);

  const initial = previousRegistration.success
    ? previousRegistration.data
    : { fullName: user.name };

  return (
    <Card className="w-full sm:max-w-2xl">
      <CardHeader>
        <CardTitle>Application: {event.name}</CardTitle>
        <CardDescription>
          Update your registration information for this event.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegistrationForm
          options={options}
          submitAction={registerParticipant}
          eventId={eventId}
          initial={initial}
        />
      </CardContent>
    </Card>
  );
}
