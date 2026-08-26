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

export function isObjectStorageKey(
  value: string | null | undefined,
): value is string {
  return Boolean(
    value &&
    (value.startsWith('profile-pictures/') || value.startsWith('resumes/')),
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
