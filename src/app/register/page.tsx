import { redirect } from "next/navigation";

import { getUser } from "@/utils/auth";

export default async function RegisterPage() {
  const user = await getUser();
  if (!user) redirect("/signin");

  redirect("/dashboard/events");
}
