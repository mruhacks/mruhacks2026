'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type WikiSidebarArticle = {
  slug: string;
  title: string;
  published: boolean;
};

/**
 * Client component so the active article can be highlighted from the live
 * pathname — the server layout above it doesn't re-render on navigation and
 * has no way to know which article segment is currently selected.
 */
export function WikiSidebar({
  eventHref,
  articles,
}: {
  eventHref: string;
  articles: WikiSidebarArticle[];
}) {
  const pathname = usePathname();
  const activeSlug = pathname.startsWith(`${eventHref}/wiki/`)
    ? pathname.slice(`${eventHref}/wiki/`.length).split('/')[0]
    : null;

  if (articles.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        Nothing has been published yet.
      </p>
    );
  }

  return (
    <nav aria-label='Wiki articles' className='flex flex-col gap-0.5'>
      {articles.map((article) => {
        const isActive = article.slug === activeSlug;
        return (
          <Link
            key={article.slug}
            href={`${eventHref}/wiki/${article.slug}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span className='truncate'>{article.title}</span>
            {!article.published && (
              <Badge variant='outline' className='shrink-0'>
                Draft
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
