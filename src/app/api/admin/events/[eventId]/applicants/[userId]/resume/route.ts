import { and, eq } from 'drizzle-orm';

import { eventApplications, userProfiles } from '@/db/schema';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { isObjectStorageKey, resumeRedirect } from '@/utils/object-storage';

/**
 * An applicant's resume, for the event dashboard's applications table.
 *
 * `/api/profile/resume` only ever serves the caller their own file, so
 * reviewing a roster needs this separate route. It is gated on
 * `application:read:all` — the same permission that reveals the applicant's
 * name and answers in the first place — rather than a broader admin check,
 * and it additionally requires the applicant to have applied to *this*
 * event, so an event's reviewer can't page through resumes belonging to a
 * different event's applicants.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; userId: string }> },
) {
  const { eventId, userId } = await params;

  const admin = await getUser();
  if (!admin) return new Response('Unauthorized', { status: 401 });
  if (!(await hasPermission(admin.id, 'application:read:all'))) {
    return new Response('Forbidden', { status: 403 });
  }

  const [row] = await db
    .select({
      key: userProfiles.resumeFile,
      fileName: userProfiles.resumeFileName,
    })
    .from(eventApplications)
    .innerJoin(
      userProfiles,
      eq(userProfiles.userId, eventApplications.userId),
    )
    .where(
      and(
        eq(eventApplications.eventId, eventId),
        eq(eventApplications.userId, userId),
      ),
    )
    .limit(1);

  if (!row?.key || !isObjectStorageKey(row.key)) {
    return new Response('Not found', { status: 404 });
  }

  return resumeRedirect(row.key, row.fileName ?? 'resume');
}
