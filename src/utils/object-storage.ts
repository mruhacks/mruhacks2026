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

export function profilePictureUrl(key: string) {
  return `/api/assets/${key}`;
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
