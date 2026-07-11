import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { userProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getObject, isObjectStorageKey } from '@/utils/object-storage';

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

  try {
    const object = await getObject(profile.key);
    if (!object) return new Response('Not found', { status: 404 });
    const fileName = (profile.fileName ?? 'resume').replace(/["\\]/g, '_');
    const body = object.bytes.slice().buffer as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': object.contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[resume] failed to load resume', error);
    return new Response('Not found', { status: 404 });
  }
}
