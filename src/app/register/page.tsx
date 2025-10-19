import { getUser } from "@/utils/auth";
import RegistrationForm from "./form";
import { getOptions } from "./actions";
import { redirect } from "next/navigation";
import db from "@/utils/db";
import { participantView } from "@/db/registrations";
import { eq } from "drizzle-orm";

export default async function RegistrationPage() {
  const user = await getUser();
  if (!user) redirect("/auth");

  const [options, initial] = Promise.all([getOptions()]);

  const options = getOptions();

  return <RegistrationForm initial={{}} options={await getOptions()} />;
}
