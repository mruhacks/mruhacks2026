import { getUser } from "@/utils/auth";
import RegistrationForm from "./form";
import { getOptions, getOwnRegistration } from "./actions";
import { redirect } from "next/navigation";
import db from "@/utils/db";
import { participantView } from "@/db/registrations";
import { eq } from "drizzle-orm";

export default async function RegistrationPage() {
  const user = await getUser();
  if (!user) redirect("/auth");

  const [options, maybeInitial] = await Promise.all([
    getOptions(),
    getOwnRegistration(),
  ]);

  const initial = maybeInitial.success ? maybeInitial.data : {};

  return <RegistrationForm initial={initial} options={options} />;
}
