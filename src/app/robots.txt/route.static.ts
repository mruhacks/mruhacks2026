import robots from '@/app/robots';

// Required by `output: 'export'` for a route handler without params.
export const dynamic = 'force-static';

/**
 * The static export's `/robots.txt` (`pnpm build:static`,
 * docs/STATIC_EXPORT.md). Its `*.static.ts` page extension hides
 * `robots.ts` from Next's metadata routes, so this serializes the same
 * rules itself. Covers only the fields `robots.ts` uses.
 */
export function GET(): Response {
  const { rules, sitemap } = robots();
  const lines: string[] = [];
  for (const rule of [rules].flat()) {
    for (const agent of [rule.userAgent ?? '*'].flat()) lines.push(`User-Agent: ${agent}`);
    for (const path of [rule.allow ?? []].flat()) lines.push(`Allow: ${path}`);
    for (const path of [rule.disallow ?? []].flat()) lines.push(`Disallow: ${path}`);
    lines.push('');
  }
  for (const url of [sitemap ?? []].flat()) lines.push(`Sitemap: ${url}`);
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain' } });
}
