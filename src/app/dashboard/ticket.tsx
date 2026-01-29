import { applicationView } from "@/db/registrations";
import { getUser } from "@/utils/auth";
import { getDefaultApplicationEvent } from "@/app/register/actions";
import db from "@/utils/db";
import { and, eq } from "drizzle-orm";

type Props = {
  searchParams: Promise<{ eventId?: string }>;
};

export default async function TicketPage({ searchParams }: Props) {
  const user = await getUser();
  if (!user) return null;

  const { eventId: queryEventId } = await searchParams;
  const defaultEvent = await getDefaultApplicationEvent();
  const eventId = queryEventId ?? defaultEvent?.id;

  if (!eventId) {
    return (
      <div className="text-muted-foreground">
        No event selected. Apply to an event to see your ticket.
      </div>
    );
  }

  const [application] = await db
    .select()
    .from(applicationView)
    .where(
      and(
        eq(applicationView.eventId, eventId),
        eq(applicationView.userId, user.id),
      ),
    )
    .limit(1);

  if (!application) {
    return (
      <div className="text-muted-foreground">
        You have not applied to this event yet. Complete your application from
        the Events page.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Your application: {application.eventName}</h2>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Name</dt>
          <dd>{application.fullName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{application.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gender</dt>
          <dd>{application.gender}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">University</dt>
          <dd>{application.university}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Major</dt>
          <dd>{application.major}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Year of study</dt>
          <dd>{application.yearOfStudy}</dd>
        </div>
        {application.interests && (
          <div>
            <dt className="text-muted-foreground">Interests</dt>
            <dd>{String(application.interests)}</dd>
          </div>
        )}
        {application.dietaryRestrictions && (
          <div>
            <dt className="text-muted-foreground">Dietary restrictions</dt>
            <dd>{String(application.dietaryRestrictions)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
