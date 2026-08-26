import { getObject } from '@/utils/object-storage';

/**
 * Fallback proxy for profile pictures when `S3_PUBLIC_URL` isn't configured
 * (see `profilePictureUrl` in `@/utils/object-storage`). When it is set,
 * avatars are served directly from storage/CDN instead of through here, to
 * avoid paying egress twice (storage → server → client) on every view.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const objectKey = key.join('/');
  if (!objectKey.startsWith('profile-pictures/')) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const object = await getObject(objectKey);
    if (!object) return new Response('Not found', { status: 404 });
    const body = object.bytes.slice().buffer as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': object.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[assets] failed to load profile picture', error);
    return new Response('Not found', { status: 404 });
  }
}
