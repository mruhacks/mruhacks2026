import { getObject } from '@/utils/object-storage';

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
