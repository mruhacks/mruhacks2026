/**
 * Finishes the static export in `out/` after `STATIC_EXPORT=1 next build`
 * (`pnpm build:static`, see docs/STATIC_EXPORT.md):
 *
 * 1. Writes every resized image the pages reference. `src/lib/static-image-loader.ts`
 *    points `next/image` at `/_img/<width>/<quality>/<src>.webp`. Nothing
 *    serves those on request, so this scans the HTML for them and renders
 *    each one from the original with sharp.
 * 2. Fails if any page links or loads a same-origin path that isn't in
 *    `out/` (an `/api/` URL, `/dashboard`, …). That's anything that would
 *    need the app server, which is off while this export is live.
 * 3. Writes `_headers` (Cloudflare's static-asset header file), carrying
 *    the security headers `next.config.ts` sends on the live app, with a
 *    CSP trimmed to what the static pages load.
 */
import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { readPublicAssetsBaseUrl } from '@/lib/object-storage-endpoint';

const OUT = path.resolve(process.argv[2] ?? 'out');

/** Matches `src/lib/static-image-loader.ts`. */
const IMAGE_URL = /\/_img\/(\d+)\/(\d+)(\/[^\s"'\\,)]+?)\.webp/g;

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

/** `out/` path for a URL path, or undefined if the export doesn't serve it. */
function resolveServedFile(urlPath: string): string | undefined {
  const decoded = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  const file = path.join(OUT, decoded);
  if (!file.startsWith(OUT)) return undefined;
  return [file, `${file}.html`, path.join(file, 'index.html')].find(isFile);
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

async function generateImages(pages: string[]): Promise<number> {
  const wanted = new Map<string, { width: number; quality: number; src: string }>();
  for (const page of pages) {
    for (const [url, width, quality, src] of (await readFile(page, 'utf8')).matchAll(IMAGE_URL)) {
      wanted.set(url, { width: Number(width), quality: Number(quality), src });
    }
  }

  await Promise.all(
    [...wanted].map(async ([url, { width, quality, src }]) => {
      const original = resolveServedFile(src);
      if (!original) throw new Error(`${url}: original ${src} isn't in the export`);
      const target = path.join(OUT, url);
      await mkdir(path.dirname(target), { recursive: true });
      await sharp(original).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(target);
    }),
  );
  return wanted.size;
}

/**
 * The privacy policy and terms point readers at their account settings in
 * the body text. While the app is offline those land on the static 404,
 * which says so, and that's fine. Anything else must resolve.
 */
const ALLOWED_OFFLINE_LINKS = new Set(['/dashboard/account', '/dashboard/profile']);

/** Same-origin `href`/`src`/`srcset` targets in an HTML file. */
function localReferences(html: string): string[] {
  const refs: string[] = [];
  for (const [, attr, value] of html.matchAll(/\s(href|src|srcset|imagesrcset)="([^"]*)"/gi)) {
    const urls = /srcset/i.test(attr) ? value.split(',').map((entry) => entry.trim().split(/\s+/)[0]) : [value];
    refs.push(...urls.map((url) => url.replaceAll('&amp;', '&')).filter((url) => /^\/(?!\/)/.test(url)));
  }
  return refs;
}

async function checkLinks(htmlFiles: string[]): Promise<void> {
  const broken: string[] = [];
  for (const file of htmlFiles) {
    for (const ref of new Set(localReferences(await readFile(file, 'utf8')))) {
      if (!ALLOWED_OFFLINE_LINKS.has(ref) && !resolveServedFile(ref))
        broken.push(`${path.relative(OUT, file)} → ${ref}`);
    }
  }
  if (broken.length > 0) {
    throw new Error(
      `These pages reference paths the static export doesn't have, which would need the app server:\n  ${broken.join('\n  ')}`,
    );
  }
}

async function writeHeaders(): Promise<void> {
  const publicAssetsBaseUrl = readPublicAssetsBaseUrl();
  const csp = [
    "default-src 'self'",
    // static.cloudflareinsights.com: Cloudflare's own edge-injected Web
    // Analytics beacon, as in next.config.ts.
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    // The public bucket (or its CDN) serves project cover and write-up images.
    `img-src 'self' data:${publicAssetsBaseUrl ? ` ${new URL(publicAssetsBaseUrl).origin}` : ''}`,
    "font-src 'self' data:",
    "connect-src 'self' https://cloudflareinsights.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
`;
  await writeFile(path.join(OUT, '_headers'), headers);
}

async function main() {
  if (!existsSync(path.join(OUT, 'index.html'))) {
    throw new Error(`${OUT}/index.html not found. Run \`STATIC_EXPORT=1 next build\` first.`);
  }
  const files = await listFiles(OUT);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  // RSC payloads for client-side navigation reference the same images.
  const pages = [...htmlFiles, ...files.filter((file) => file.endsWith('.txt'))];

  const images = await generateImages(pages);
  await checkLinks(htmlFiles);
  await writeHeaders();
  console.log(
    `✓ Static export ready in ${path.relative(process.cwd(), OUT) || '.'}: ${htmlFiles.length} pages, ${images} resized images`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
