import sitemap from '@/app/sitemap';

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);

// Required by `output: 'export'` for a route handler without params.
export const dynamic = 'force-static';

/**
 * The static export's `/sitemap.xml` (`pnpm build:static`,
 * docs/STATIC_EXPORT.md). Its `*.static.ts` page extension hides
 * `sitemap.ts` from Next's metadata routes, so this serializes the same
 * entries itself. Covers only the fields `sitemap.ts` uses.
 */
export async function GET(): Promise<Response> {
  const urls = (await sitemap()).map((entry) =>
    [
      '<url>',
      `<loc>${escapeXml(entry.url)}</loc>`,
      entry.changeFrequency && `<changefreq>${entry.changeFrequency}</changefreq>`,
      entry.priority !== undefined && `<priority>${entry.priority}</priority>`,
      '</url>',
    ]
      .filter(Boolean)
      .join(''),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
