import { redirect } from 'next/navigation';

import { requireVerifiedUser } from '@/utils/auth';

export default async function RegisterRedirectContent() {
  await requireVerifiedUser();
  return redirect('/dashboard/events');
}
