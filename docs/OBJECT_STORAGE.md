# Object storage

One S3 bucket (MinIO locally) holds every upload. It is private: the app hands
out short-lived presigned URLs through `/api/assets` and `/api/profile/resume`.

The one exception is the **resized project submission images**. Each image
uploaded to a project (its cover, or an image in its write-up) is stored as:

| Key                                              | Readable by                  | What                                     |
| ------------------------------------------------ | ---------------------------- | ---------------------------------------- |
| `submission-content/<submission>/<uuid>.<ext>`   | `/api/assets` only (private) | The original, as uploaded (EXIF and all) |
| `submission-content/<submission>/<uuid>-w480.webp`  | anyone                    | Resized copy, metadata stripped          |
| `submission-content/<submission>/<uuid>-w960.webp`  | anyone                    | 〃                                       |
| `submission-content/<submission>/<uuid>-w1600.webp` | anyone                    | 〃                                       |

The project gallery, homepage podium and project pages load the copies directly
from the bucket with a `srcset`. They're sent with
`Cache-Control: public, max-age=31536000, immutable` (keys are random and never
rewritten), so a viewer downloads each one once. Code: `src/lib/submission-images.ts`
and `src/lib/submission-image-variants.ts`.

A draft's copies are public too, at an unguessable URL. Originals stay private
because they can carry GPS data.

## Production setup (AWS S3)

1. **Bucket policy.** In the bucket's _Permissions_ tab, turn off _Block public
   access → Block public and cross-account access to buckets and objects
   granted through new/any public bucket policies_ (leave the two ACL options
   on). Then add this statement, replacing `BUCKET`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicSubmissionImageVariants",
         "Effect": "Allow",
         "Principal": "*",
         "Action": ["s3:GetObject"],
         "Resource": ["arn:aws:s3:::BUCKET/submission-content/*-w*.webp"]
       }
     ]
   }
   ```

   This is the same policy `publicReadPolicy()` in `src/utils/object-storage.ts`
   applies to the local MinIO bucket. Keep them in sync. The app never changes
   the production policy itself.

2. **Optional CDN.** Point CloudFront, or a Cloudflare-proxied domain, at the
   bucket and set `S3_PUBLIC_BASE_URL` to it (e.g. `https://assets.mruhacks.ca`).
   Unset, pages use `https://<bucket>.s3.<region>.amazonaws.com`. The CSP and
   the URLs are built at **build time**, so redeploy after changing it.

3. **Backfill existing images**, then deploy, then backfill again:

   ```sh
   pnpm images:backfill -- --dry-run   # what's missing
   pnpm images:backfill                # resize everything missing
   ```

   It's idempotent. Running it before the deploy means the new pages never
   point at a missing copy; running it after catches uploads made in between.
   It also writes the `submission-content/health-probe-w1.webp` object the
   health check needs.

4. **Verify.** `pnpm check-health <url>` should show `publicImages` ok. A
   `403` there means the policy is missing, or the backfill hasn't run yet
   (S3 answers 403 for a missing key to anonymous callers).

## Local development

`ensureBucket` applies the policy to the MinIO bucket automatically, so
uploads made in dev just work. Run `pnpm images:backfill` once for images
uploaded before this change, or for seed data.
