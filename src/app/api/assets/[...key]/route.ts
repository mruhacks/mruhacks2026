import { getUser } from '@/utils/auth';
import { getObject, isEventAttachmentKey } from '@/utils/object-storage';

/**
 * Serves two kinds of object-storage assets:
 *
 * - `profile-pictures/…` — fallback proxy for avatars when `S3_PUBLIC_URL`
 *   isn't configured (see `profilePictureUrl` in `@/utils/object-storage`).
 *   When it is set, avatars are served directly from storage/CDN instead of
 *   through here, to avoid paying egress twice (storage → server → client) on
 *   every view.
 * - `event-content/…` — attachments embedded in event descriptions and wiki
 *   articles. These always come through here, never from a public bucket URL,
 *   because the wiki lives behind the dashboard and so must its images.
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

  try {
    const object = await getObject(objectKey);
    if (!object) return new Response('Not found', { status: 404 });
    const body = object.bytes.slice().buffer as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': object.contentType,
        // Keys are content-addressed by a fresh UUID per upload, so a given
        // key never changes. Attachments cache privately: the response was
        // gated on the caller's session and must not land in a shared cache.
        'Cache-Control': isAttachment
          ? 'private, max-age=31536000, immutable'
          : 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[assets] failed to load object', error);
    return new Response('Not found', { status: 404 });
  }
}
