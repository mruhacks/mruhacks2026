import { redirect } from "next/navigation";

import RegistrationForm from "@/components/registration-form";
import { getUser } from "@/utils/auth";
import { getOptions, registerParticipant } from "./actions";
import db from "@/utils/db";
import { participants } from "@/db/registrations";
import { eq } from "drizzle-orm";

export default async function RegistrationPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const isregistered =
    (
      await db
        .select({ id: participants.userId })
        .from(participants)
        .where(eq(participants.userId, user.id))
    ).length > 0;

  if (isregistered) redirect("/dashboard");

  const options = await getOptions();

  return (
    <RegistrationForm options={options} onSubmitAction={registerParticipant} />
  );
}
