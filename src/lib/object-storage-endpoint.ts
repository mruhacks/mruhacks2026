/**
 * Object-storage location, read from env with no fallbacks: `S3_BUCKET` and
 * `S3_REGION` are required, `S3_ENDPOINT` is set only for a non-AWS host
 * (MinIO in dev). Shared by the S3 client and the CSP in `next.config.ts`,
 * so the presigned URLs `/api/assets` redirects to always land on exactly
 * the origin the CSP allows.
 *
 * On AWS the bucket is addressed virtual-hosted style
 * (`https://<bucket>.s3.<region>.amazonaws.com`), so the CSP can name our
 * bucket's own host. Path-style URLs would share one regional host with
 * every other bucket, and a CSP path can't narrow that: browsers ignore
 * source-expression paths once a request has been redirected, which every
 * asset load is.
 *
 * Kept free of AWS SDK imports so `next.config.ts` can load it.
 */

export type ObjectStorageConfig = {
  bucket: string;
  region: string;
  /** Passed to `S3Client`; undefined lets the SDK resolve AWS itself. */
  endpoint?: string;
  forcePathStyle: boolean;
  /** The origin presigned URLs point at, for CSP. */
  origin: string;
};

/** The configured storage, or null if a required var is missing or bad. */
export function readObjectStorageConfig(): ObjectStorageConfig | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  if (!bucket || !region) return null;

  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (!endpoint) {
    // The SDK's own AWS endpoint, which is virtual-hosted style.
    return {
      bucket,
      region,
      forcePathStyle: false,
      origin: `https://${bucket}.s3.${region}.amazonaws.com`,
    };
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }

  // A dotted bucket name breaks AWS's `*.s3…` wildcard certificate, so only
  // a plain one can move into the hostname.
  if (url.hostname.endsWith('.amazonaws.com') && !bucket.includes('.')) {
    return {
      bucket,
      region,
      endpoint,
      forcePathStyle: false,
      origin: `${url.protocol}//${bucket}.${url.host}`,
    };
  }

  // MinIO and other S3-compatible hosts: path style, so the CSP has to allow
  // the whole endpoint origin.
  return {
    bucket,
    region,
    endpoint,
    forcePathStyle: true,
    origin: url.origin,
  };
}
