import { redirect } from 'next/navigation';
import { getFeaturedEventRegisterUrl } from '@/lib/featured-event';

/**
 * Public /register route — same destination as the "Register Now" button
 * (see RegisterOrDashboardButton), i.e. registration for the featured event.
 */
export default async function RegisterRedirect() {
  redirect(await getFeaturedEventRegisterUrl());
}
