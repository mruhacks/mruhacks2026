import { getUser } from '@/utils/auth';
import {
  eventAttachmentRedirect,
  isEventAttachmentKey,
  profilePictureRedirect,
} from '@/utils/object-storage';

/**
 * Redirects to a signed URL for two kinds of object-storage assets — the
 * actual presigning and redirect response live in `@/utils/object-storage`
 * (`profilePictureRedirect` / `eventAttachmentRedirect`), so this route is
 * just the access-control decision for each key shape:
 *
 * - `profile-pictures/…` — avatars. No session required: these need to be
 *   visible to other users too (team rosters, admin user lists), not just
 *   the owner.
 * - `event-content/…` — attachments embedded in event descriptions and wiki
 *   articles. Requires a signed-in session, since the wiki lives behind the
 *   dashboard and so must its images.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const objectKey = key.join('/');

  const isAttachment: boolean = isEventAttachmentKey(objectKey);

  if (isAttachment) {
    const user = await getUser();
    if (!user) return new Response('Not found', { status: 404 });
  } else if (!objectKey.startsWith('profile-pictures/')) {
    return new Response('Not found', { status: 404 });
  }

  return isAttachment
    ? eventAttachmentRedirect(objectKey)
    : profilePictureRedirect(objectKey);
}
