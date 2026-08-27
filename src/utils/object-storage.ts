import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
 * The bucket is private — nothing in it is fetchable without a signature.
 * Every stored URL (`authUser.image`, markdown attachment links) is a stable
 * `/api/assets/<key>` (or, for resumes, `/api/profile/resume`) path that never
 * expires and never changes for a given upload. That route resolves the key
 * to a short-lived presigned S3/R2 URL and 302s to it, so the actual bytes
 * still flow browser → storage directly (no egress through the app server),
 * while access control and link stability both stay on our side.
 */
export function profilePictureUrl(key: string) {
  return `/api/assets/${key}`;
}

/**
 * Inverse of `profilePictureUrl`: extracts the storage key from a stored
 * image URL, or null if it isn't one of ours (e.g. an OAuth avatar URL).
 */
export function parseProfilePictureKey(
  image: string | null | undefined,
): string | null {
  if (!image) return null;
  const prefix = '/api/assets/';
  if (!image.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(image.slice(prefix.length));
  } catch {
    return null;
  }
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

/** Markdown attachments are always served through the `/api/assets` proxy, gated on a signed-in session — see `profilePictureUrl` for how the redirect works. */
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

export async function putObject({
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

/**
 * Signs a temporary GET URL for `key`, after confirming the object exists (a
 * `HeadObjectCommand` — presigning itself is a local computation and would
 * happily sign a URL for an object that was never there or has since been
 * deleted). Returns null for an unknown key shape or a missing object; any
 * other failure (bad credentials, unreachable endpoint) propagates so the
 * caller can log it.
 */
async function presignGetUrl(
  key: string,
  opts: { expiresIn: number; responseContentDisposition?: string },
): Promise<string | null> {
  if (!isObjectStorageKey(key)) return null;
  await ensureBucket();
  const client = getClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    return null;
  }
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(opts.responseContentDisposition
        ? { ResponseContentDisposition: opts.responseContentDisposition }
        : {}),
    }),
    { expiresIn: opts.expiresIn },
  );
}

/**
 * Turns a key into the 302 response the serving routes hand back: this is the
 * one place that presigns and redirects, so every object type (avatars,
 * attachments, resumes) gets the same "sign, check it exists, redirect, log
 * and 404 on failure" behavior instead of each route reimplementing it. The
 * redirect's `Cache-Control` is set well under `expiresIn` so a browser never
 * replays a cached redirect to an already-expired signed URL.
 */
async function redirectToObject(
  key: string,
  opts: {
    expiresIn: number;
    cacheControl: string;
    responseContentDisposition?: string;
  },
): Promise<Response> {
  try {
    const url = await presignGetUrl(key, opts);
    if (!url) return new Response('Not found', { status: 404 });
    return new Response(null, {
      status: 302,
      headers: { Location: url, 'Cache-Control': opts.cacheControl },
    });
  } catch (error) {
    console.error('[storage] failed to presign object', { key, error });
    return new Response('Not found', { status: 404 });
  }
}

const PROFILE_PICTURE_URL_TTL_SECONDS = 60 * 60;
const EVENT_ATTACHMENT_URL_TTL_SECONDS = 60 * 60;
const RESUME_URL_TTL_SECONDS = 5 * 60;

/**
 * Redirects to a signed URL for a profile picture. No session check here —
 * avatars need to be visible to other users too (team rosters, admin user
 * lists, anywhere a name is shown), not just the owner, so this is reachable
 * by anyone who has the (unguessable, UUID-keyed) `/api/assets/<key>` link.
 */
export function profilePictureRedirect(key: string): Promise<Response> {
  return redirectToObject(key, {
    expiresIn: PROFILE_PICTURE_URL_TTL_SECONDS,
    cacheControl: `public, max-age=${PROFILE_PICTURE_URL_TTL_SECONDS / 2}`,
  });
}

/** Redirects to a signed URL for an event/wiki attachment. Caller must check the session before calling this — see `/api/assets`. */
export function eventAttachmentRedirect(key: string): Promise<Response> {
  return redirectToObject(key, {
    expiresIn: EVENT_ATTACHMENT_URL_TTL_SECONDS,
    cacheControl: `private, max-age=${EVENT_ATTACHMENT_URL_TTL_SECONDS / 2}`,
  });
}

/**
 * Redirects to a signed URL for the caller's own resume, with a
 * `Content-Disposition` naming the download after their original filename.
 * Short-lived and never cached — this is only ever hit right before a
 * download starts, from the session-gated `/api/profile/resume` route.
 */
export function resumeRedirect(
  key: string,
  fileName: string,
): Promise<Response> {
  const safeName = fileName.replace(/["\\]/g, '_');
  return redirectToObject(key, {
    expiresIn: RESUME_URL_TTL_SECONDS,
    cacheControl: 'private, no-store',
    responseContentDisposition: `attachment; filename="${safeName}"`,
  });
}
