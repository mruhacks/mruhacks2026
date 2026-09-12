import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { userProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isObjectStorageKey, resumeRedirect } from '@/utils/object-storage';

export async function GET() {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const [profile] = await db
    .select({
      key: userProfiles.resumeFile,
      fileName: userProfiles.resumeFileName,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1);
  if (!profile?.key || !isObjectStorageKey(profile.key)) {
    return new Response('Not found', { status: 404 });
  }

  return resumeRedirect(profile.key, profile.fileName ?? 'resume');
}
