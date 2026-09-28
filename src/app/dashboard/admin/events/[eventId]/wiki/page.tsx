import * as React from 'react';
import { redirect } from 'next/navigation';

import { getUser } from '@/utils/auth';
import { requirePermission } from '@/lib/rbac/authorization';
import {
  canWriteArticles,
  getEventArticle,
  listEventArticles,
} from '@/app/dashboard/admin/events/content-actions';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { ArticleEditor } from './article-editor';
import { WikiArticleList } from './wiki-article-list';

type WikiPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Shows either the article index or one article's editor, the latter behind
 * `?article=<id>`. Now that the wiki is its own route it could nest the
 * editor as a child segment instead; the query param is kept so existing
 * links and bookmarks still resolve.
 *
 * Sync shell, with the session and article reads pushed into `WikiContent`
 * behind Suspense — see `questions/page.tsx`.
 */
export default function WikiPage({ params, searchParams }: WikiPageProps) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <WikiContent paramsPromise={params} searchParamsPromise={searchParams} />
    </React.Suspense>
  );
}

async function WikiContent({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: WikiPageProps['params'];
  searchParamsPromise: WikiPageProps['searchParams'];
}) {
  const [{ eventId }, { article: rawArticleId }] = await Promise.all([
    paramsPromise,
    searchParamsPromise,
  ]);
  const articleId = Array.isArray(rawArticleId)
    ? rawArticleId[0]
    : rawArticleId;

  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'article:read:all');

  if (articleId) {
    const canWrite = await canWriteArticles();
    return (
      <ArticlePanel
        eventId={eventId}
        articleId={articleId}
        canWrite={canWrite}
      />
    );
  }

  // Only the index needs both, and they don't depend on each other.
  const [result, canWrite] = await Promise.all([
    listEventArticles(eventId),
    canWriteArticles(),
  ]);
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
      {result.success && result.data && (
        <BreadcrumbSegment id={articleId} label={result.data.title} />
      )}

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
