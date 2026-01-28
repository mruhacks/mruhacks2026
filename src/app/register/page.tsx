import { redirect } from "next/navigation";

import { getUser } from "@/utils/auth";
import {
  getOptions,
  getPreviousFormSubmission,
  registerParticipant,
} from "./actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import RegistrationForm from "@/components/registration-form";

const measure = async <T,>(label: string, fn: () => Promise<T>) => {
  const t0 = performance.now();
  const res = await fn();
  const t1 = performance.now();
  console.log(`${label} took ${(t1 - t0).toFixed(2)}ms`);
  return res;
};

export default async function RegistrationPage() {
  const user = await measure("getUser", getUser);
  if (!user) redirect("/login");

  const [previousRegistration, options] = await Promise.all([
    measure("getPreviousFormSubmission", getPreviousFormSubmission),
    measure("getOptions", getOptions),
  ]);

  const initial = previousRegistration.success
    ? previousRegistration.data
    : { fullName: user.name };

  return (
    <Card className="
      w-full
      sm:max-w-2xl
    ">
      <CardHeader>
        <CardTitle>Registration Information</CardTitle>
        <CardDescription>Update your registration information.</CardDescription>
      </CardHeader>
      <CardContent>
        <RegistrationForm
          options={options}
          onSubmitAction={registerParticipant}
          initial={initial}
        />
      </CardContent>
    </Card>
  );
}
