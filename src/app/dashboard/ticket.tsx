import { participantView } from '@/db/registrations';
import { getUser } from '@/utils/auth';
import db from '@/utils/db';
import { eq } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getUserDetails() {
  const user = (await getUser())!;

  const [userDetails] = await db
    .select()
    .from(participantView)
    .where(eq(participantView.userId, user.id));

  return userDetails;
}

export default async function Ticket() {}
