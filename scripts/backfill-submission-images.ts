import 'dotenv/config';

import sharp from 'sharp';

import * as schema from '@/db/schema';
import {
  createSubmissionImageVariants,
  hasSubmissionImageVariants,
  putSubmissionImageVariants,
  submissionImageKeys,
} from '@/lib/submission-image-variants';
import { PUBLIC_IMAGE_PROBE_KEY } from '@/lib/submission-images';
import { client, db } from '@/utils/db';
import { getObjectBytes, putObject } from '@/utils/object-storage';

const USAGE = `
Usage:
  pnpm images:backfill [-- --dry-run] [-- --force]

Writes the public, resized WebP copies (see src/lib/submission-images.ts) of
every project submission image — covers and inline images — that doesn't
have all of them yet, and the probe object /api/health checks for.

Safe to re-run: images whose copies all exist are skipped. Run it once
before deploying the change that renders the copies (so pages never point at
missing ones), and again after, to catch anything uploaded in between.

Options:
  --dry-run   Only report which images are missing copies.
  --force     Regenerate every image's copies, even existing ones.
`.trim();

/** Images processed at once: each is a download, three encodes and three uploads. */
const CONCURRENCY = 4;

async function writeProbe(): Promise<void> {
  const body = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } })
    .webp()
    .toBuffer();
  await putObject({ key: PUBLIC_IMAGE_PROBE_KEY, body: new Uint8Array(body), contentType: 'image/webp' });
}

async function backfillImage(key: string, force: boolean, dryRun: boolean): Promise<'skipped' | 'done' | 'missing'> {
  if (!force && (await hasSubmissionImageVariants(key))) return 'skipped';
  if (dryRun) return 'done';
  const original = await getObjectBytes(key);
  if (!original) return 'missing';
  await putSubmissionImageVariants(key, await createSubmissionImageVariants(original));
  return 'done';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const unknown = args.filter((arg) => arg !== '--dry-run' && arg !== '--force');
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown.join(' ')}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  const submissions = await db
    .select({
      id: schema.submissions.id,
      markdown: schema.submissions.markdown,
      coverImageUrl: schema.submissions.coverImageUrl,
    })
    .from(schema.submissions);
  const keys = submissions.flatMap((row) => [...submissionImageKeys(row.id, row.markdown, row.coverImageUrl)]);
  console.log(`${submissions.length} submissions, ${keys.length} images${dryRun ? ' (dry run)' : ''}`);

  const counts = { skipped: 0, done: 0, missing: 0, failed: 0 };
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++]!;
      try {
        const result = await backfillImage(key, force, dryRun);
        counts[result]++;
        if (result === 'done') console.log(`${dryRun ? 'needs copies' : 'resized'}  ${key}`);
        if (result === 'missing') console.warn(`original missing  ${key}`);
      } catch (error) {
        counts.failed++;
        console.error(`failed  ${key}`, error);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (!dryRun) await writeProbe();

  console.log(
    `${dryRun ? 'Would resize' : 'Resized'} ${counts.done}, already done ${counts.skipped}, ` +
      `original missing ${counts.missing}, failed ${counts.failed}.`,
  );
  if (counts.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
