import { redirect, notFound } from "next/navigation";

import { getUser } from "@/utils/auth";
import {
  getOptions,
  getPreviousFormSubmission,
  submitEventApplication,
} from "@/app/dashboard/events/actions";
import { getUserProfile, saveUserProfile } from "@/app/dashboard/profile/actions";
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
import ProfileForm from "@/components/profile-form";
import ApplicationForm from "@/components/application-form";

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function ApplyEventPage({ params }: Props) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) redirect("/signin");

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

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

  const [previousApplication, options, profileResult] = await Promise.all([
    getPreviousFormSubmission(eventId),
    getOptions(),
    getUserProfile(),
  ]);

  const hasProfile =
    profileResult.success && profileResult.data != null;
  const profileData = hasProfile ? profileResult.data : null;

  const prev = previousApplication.success ? previousApplication.data : null;
  const profileInitial = prev
    ? {
        fullName: prev.fullName,
        genderId: prev.genderId,
        universityId: prev.universityId,
        majorId: prev.majorId,
        yearOfStudyId: prev.yearOfStudyId,
        interests: prev.interests ?? [],
        dietaryRestrictions: prev.dietaryRestrictions ?? [],
      }
    : profileData ?? { fullName: user.name };

  const eventInitial = prev
    ? {
        attendedBefore: prev.attendedBefore,
        accommodations: prev.accommodations,
        applicationResponses: prev.applicationResponses ?? {},
      }
    : {
        attendedBefore: false,
        accommodations: "",
        applicationResponses: {} as Record<string, unknown>,
      };

  if (!hasProfile && !previousApplication.success) {
    redirect(`/dashboard/profile?next=/dashboard/events/${eventId}/apply`);
  }

  return (
    <Card className="w-full sm:max-w-2xl">
      <CardHeader>
        <CardTitle>Application: {event.name}</CardTitle>
        <CardDescription>
          Update your profile and event application below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section>
          <h3 className="text-sm font-medium mb-4">Your profile</h3>
          <ProfileForm
            initial={profileInitial}
            options={options}
            onSubmit={saveUserProfile}
          />
        </section>
        <section>
          <h3 className="text-sm font-medium mb-4">Event questions</h3>
          <ApplicationForm
            initial={eventInitial}
            options={options}
            applicationQuestions={event.applicationQuestions ?? null}
            submitAction={submitEventApplication}
            eventId={eventId}
          />
        </section>
      </CardContent>
    </Card>
  );
}
