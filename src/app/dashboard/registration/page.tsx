import { getUser } from "@/utils/auth";
import { redirect } from "next/navigation";
import { getOwnRegistration } from "./getOwnRegistration";

export default async function myRegistration() {
  const registration = await getOwnRegistration();

  if (!registration.success || !registration.data) {
    redirect("/register");
  }
  return (
    <>
      <code>{JSON.stringify(await getOwnRegistration())}</code>
    </>
  );
}
