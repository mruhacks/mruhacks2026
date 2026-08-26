import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function AdminEventQuestionsPage({ params }: Props) {
  const { eventId } = await params;
  // Redirect to the new parallel routes page with questions tab
  redirect(`/dashboard/admin/events/${eventId}?tab=questions`);
}
