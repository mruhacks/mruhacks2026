import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function RegisterEventIdRedirect({ params }: Props) {
  const { eventId } = await params;
  redirect(`/dashboard/events/${eventId}/apply`);
}
