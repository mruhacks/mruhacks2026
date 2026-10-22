import 'server-only';

import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';

import * as schema from '@/db/schema';
import { resolveEventId } from '@/lib/events';
import * as Rbac from '@/lib/rbac/server';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';

export type SignInQrJudge = {
  eventId: string;
  judgeId: string;
  label: string;
  email: string;
};

/**
 * The judge a sign-in QR page is for, behind the same gate as the route that
 * mints the code. Only reads: the link itself is minted by the `<img>`
 * request, so rendering (or prefetching) this page signs no one in. A
 * missing, deleted or disabled judge is a 404, as the route treats them.
 */
export async function loadSignInQrJudge(segment: string, judgeId: string): Promise<SignInQrJudge> {
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  await Rbac.requirePermission(user.id, 'judging:signin:all');

  const [row] = await db
    .select({
      email: schema.eventJudges.email,
      disabledAt: schema.eventJudges.disabledAt,
      name: schema.user.name,
    })
    .from(schema.eventJudges)
    .leftJoin(schema.user, eq(schema.user.id, schema.eventJudges.userId))
    .where(and(eq(schema.eventJudges.id, judgeId), eq(schema.eventJudges.eventId, eventId)))
    .limit(1);
  if (!row?.email || row.disabledAt) notFound();

  return { eventId, judgeId, label: row.name || row.email, email: row.email };
}
