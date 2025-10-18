import { getUser } from "@/utils/auth";
import RegistrationForm from "./form";

export default async function RegistrationPage() {
  const user = await getUser();

  if (!user) throw new Error("User must be logged in");

  return (
    <div className="p-6">
      <RegistrationForm initial={{}} />{" "}
    </div>
  );
}
