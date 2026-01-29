import { redirect } from "next/navigation";

import { getUser } from "@/utils/auth";
import { getDefaultApplicationEvent } from "./actions";

export default async function RegisterPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const defaultEvent = await getDefaultApplicationEvent();
  if (!defaultEvent) {
    return (
      <div className="text-center text-muted-foreground">
        No application events are available at the moment.
      </div>
    );
  }

  redirect(`/register/${defaultEvent.id}`);
}
