import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { getUser } from '@/utils/auth';
import { requirePermission } from '@/lib/rbac/authorization';
import {
  canWriteArticles,
  getEventArticle,
  listEventArticles,
} from '@/app/dashboard/admin/events/content-actions';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Button } from '@/components/ui/button';
import { ArticleEditor } from './article-editor';
import { WikiArticleList } from './wiki-article-list';

type WikiPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * The wiki tab shows either the article index or one article's editor. The
 * editor lives here behind `?article=<id>` rather than at its own route
 * because this event page is built from parallel-route slots and its layout
 * renders only those slots — a nested child route would never be shown.
 */
export default async function WikiPage({
  params,
  searchParams,
}: WikiPageProps) {
  const { eventId } = await params;
  const { article: rawArticleId } = await searchParams;
  const articleId = Array.isArray(rawArticleId)
    ? rawArticleId[0]
    : rawArticleId;

  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'article:read:all');

  const canWrite = await canWriteArticles();

  if (articleId) {
    return (
      <ArticlePanel
        eventId={eventId}
        articleId={articleId}
        canWrite={canWrite}
      />
    );
  }

  const result = await listEventArticles(eventId);
  if (!result.success || !result.data) {
    return (
      <div className='text-destructive'>
        {!result.success ? result.error : 'Articles not found'}
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div>
        <h2 className='text-lg font-semibold'>Wiki</h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          Articles published here appear under this event for participants.
          Drafts stay visible to organizers only.
        </p>
      </div>
      <WikiArticleList
        eventId={eventId}
        articles={result.data}
        canWrite={canWrite}
      />
    </div>
  );
}

async function ArticlePanel({
  eventId,
  articleId,
  canWrite,
}: {
  eventId: string;
  articleId: string;
  canWrite: boolean;
}) {
  const result = await getEventArticle(eventId, articleId);

  return (
    <div className='space-y-6'>
      <Button
        asChild
        variant='ghost'
        size='sm'
        className='text-muted-foreground -ml-2'
      >
        <Link href={`/dashboard/admin/events/${eventId}?tab=wiki`}>
          <ArrowLeft className='mr-1.5 size-4' />
          All articles
        </Link>
      </Button>

      {!result.success || !result.data ? (
        <p className='text-destructive'>
          {!result.success ? result.error : 'Article not found'}
        </p>
      ) : canWrite ? (
        <ArticleEditor eventId={eventId} article={result.data} />
      ) : (
        // `article:read:all` without `article:write:all` is a legitimate
        // combination — show the article rather than bouncing to /forbidden.
        <div className='space-y-4'>
          <h2 className='text-2xl font-semibold'>{result.data.title}</h2>
          {result.data.bodyMarkdown.trim() ? (
            <MarkdownContent markdown={result.data.bodyMarkdown} />
          ) : (
            <p className='text-muted-foreground text-sm'>
              This article has no content yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
