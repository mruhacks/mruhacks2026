import { redirect } from 'next/navigation';

export default function EventPage() {
  // Redirect to overview by default
  redirect('?tab=overview');
}
