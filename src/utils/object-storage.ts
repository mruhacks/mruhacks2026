import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET?.trim() || 'mruhacks-assets';

function getClient() {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const isLocal = process.env.NODE_ENV !== 'production';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  return new S3Client({
    ...(endpoint || isLocal
      ? {
          endpoint: endpoint || 'http://localhost:9000',
          forcePathStyle: true,
        }
      : {}),
    region: process.env.S3_REGION?.trim() || 'us-east-1',
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : isLocal
        ? {
            credentials: {
              accessKeyId: 'minioadmin',
              secretAccessKey: 'minioadmin',
            },
          }
        : {}),
  });
}

let bucketReady: Promise<void> | undefined;

async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const client = getClient();
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        try {
          await client.send(new CreateBucketCommand({ Bucket: bucket }));
        } catch (error) {
          // A concurrent request or the MinIO initializer may have created it.
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
          console.debug(
            '[storage] bucket creation raced with another process',
            error,
          );
        }
      }
    })();
  }
  try {
    await bucketReady;
  } catch (error) {
    bucketReady = undefined;
    throw error;
  }
}

/** Verifies the configured bucket is reachable, without creating it. */
export async function checkObjectStorageConnection(): Promise<void> {
  await getClient().send(new HeadBucketCommand({ Bucket: bucket }));
}

/** Prefix under which markdown attachments (event descriptions, wiki articles) live. */
const EVENT_CONTENT_PREFIX = 'event-content/';

export function isObjectStorageKey(
  value: string | null | undefined,
): value is string {
  return Boolean(
    value &&
    (value.startsWith('profile-pictures/') ||
      value.startsWith('resumes/') ||
      value.startsWith(EVENT_CONTENT_PREFIX)),
  );
}

/**
 * Profile pictures are served straight from object storage/CDN rather than
 * proxied through the app server — proxying would mean paying egress twice
 * (storage → server, then server → client) for every avatar view. Set
 * `S3_PUBLIC_URL` to a base URL where the `profile-pictures/` prefix is
 * publicly readable (public bucket, or a CDN in front of it) to enable this.
 * Without it, falls back to the `/api/assets` proxy route (fine for local
 * dev, still cached aggressively, just not egress-free).
 */
export function profilePictureUrl(key: string) {
  const publicBase = process.env.S3_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (publicBase) return `${publicBase}/${key}`;
  return `/api/assets/${key}`;
}

/**
 * Inverse of `profilePictureUrl`: extracts the storage key from a stored
 * image URL, or null if it isn't one of ours (e.g. an OAuth avatar URL).
 * Checks both URL shapes since `S3_PUBLIC_URL` may have been added or
 * changed after some rows were written.
 */
export function parseProfilePictureKey(
  image: string | null | undefined,
): string | null {
  if (!image) return null;
  const publicBase = process.env.S3_PUBLIC_URL?.trim().replace(/\/+$/, '');
  const prefixes = [
    publicBase ? `${publicBase}/` : null,
    '/api/assets/',
  ].filter((p): p is string => Boolean(p));
  for (const prefix of prefixes) {
    if (!image.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(image.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Attachment keys are always `event-content/<eventId>/<uuid><ext>`. Both the
 * upload action and the serving route check against this so a hand-typed
 * `/api/assets/event-content/...` can only ever name an object this app wrote.
 */
const EVENT_ATTACHMENT_KEY_PATTERN =
  /^event-content\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/;

export function isEventAttachmentKey(
  value: string | null | undefined,
): value is string {
  return Boolean(value && EVENT_ATTACHMENT_KEY_PATTERN.test(value));
}

/**
 * Markdown attachments are always served through the `/api/assets` proxy —
 * deliberately *not* through `S3_PUBLIC_URL` the way avatars are. The proxy
 * requires a signed-in session, and a publicly readable bucket URL embedded in
 * article markdown would hand that content to anyone holding the link.
 */
export function eventAttachmentUrl(key: string) {
  return `/api/assets/${key}`;
}

/** Inverse of `eventAttachmentUrl`; null when the URL isn't one of ours. */
export function parseEventAttachmentKey(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const prefix = '/api/assets/';
  if (!url.startsWith(prefix)) return null;
  let key: string;
  try {
    key = decodeURIComponent(url.slice(prefix.length));
  } catch {
    return null;
  }
  return isEventAttachmentKey(key) ? key : null;
}

export async function putPrivateObject({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Uint8Array;
  contentType: string;
}) {
  await ensureBucket();
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(key: string) {
  if (!isObjectStorageKey(key)) return;
  await ensureBucket();
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getObject(key: string) {
  if (!isObjectStorageKey(key)) return null;
  await ensureBucket();
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!result.Body) return null;
  return {
    bytes: await result.Body.transformToByteArray(),
    contentType: result.ContentType ?? 'application/octet-stream',
  };
}
