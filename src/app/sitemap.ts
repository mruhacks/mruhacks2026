import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/content';
import { getProjectShowcase } from '@/lib/project-showcase';

// Only the public marketing/legal pages and, once the podium is complete, the project gallery —
// everything else is behind sign-in and marked noindex.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const showcase = await getProjectShowcase();
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    ...(showcase ? [{ url: `${SITE_URL}/projects`, changeFrequency: 'weekly' as const, priority: 0.6 }] : []),
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
