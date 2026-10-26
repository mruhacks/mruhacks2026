import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/content';

// Only the public marketing/legal pages and the project gallery — everything else is behind sign-in
// and marked noindex.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/projects`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
