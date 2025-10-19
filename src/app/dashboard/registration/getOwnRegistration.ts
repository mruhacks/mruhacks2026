import { RegistrationFormValues } from "@/components/registration-form";
import { participantFormView } from "@/db/registrations";
import { ActionResult, fail, ok } from "@/utils/action-result";
import { getUser } from "@/utils/auth";
import db from "@/utils/db";
import { eq } from "drizzle-orm";

export async function getOwnRegistration(): Promise<
  ActionResult<RegistrationFormValues | null>
> {
  const user = await getUser();
  if (!user) return fail("User not logged in");

  console.log(user.id);

  const [participants] = await db
    .select()
    .from(participantFormView)
    .where(eq(participantFormView.userId, user.id));
  // .limit(1);

  console.log(participants);

  return ok(participants ?? null);
}
