import * as React from 'react';
import { redirect } from 'next/navigation';

import {
  canWriteArticles,
  getEventArticle,
} from '@/app/dashboard/admin/events/content-actions';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { ArticleEditor } from './article-editor';
import { Card } from '@/components/ui/card';

type ArticlePageProps = {
  params: Promise<{ eventId: string; articleId: string }>;
};

/**
 * One wiki article, on its own page. The article list and its row actions
 * live in the event overview's wiki cell, so this route is only ever the
 * editor — a full page rather than a panel because the markdown editor needs
 * the width.
 *
 * Sync shell, with the session and article reads pushed into `ArticleContent`
 * behind Suspense — see `questions/page.tsx`.
 */
export default function ArticlePage({ params }: ArticlePageProps) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <ArticleContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function ArticleContent({
  paramsPromise,
}: {
  paramsPromise: ArticlePageProps['params'];
}) {
  const { eventId, articleId } = await paramsPromise;

  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'article:read:all');

  const [result, canWrite] = await Promise.all([
    getEventArticle(eventId, articleId),
    canWriteArticles(),
  ]);

  if (!result.success || !result.data) {
    return (
      <p className='text-destructive'>
        {!result.success ? result.error : 'Article not found'}
      </p>
    );
  }
  const article = result.data;

  return (
    <Card className='space-y-6 p-6'>
      {/* Zero-render: feeds the article's title to the dashboard breadcrumb,
          which otherwise shows the raw uuid. */}
      <BreadcrumbSegment id={articleId} label={article.title} />

      {canWrite ? (
        <ArticleEditor eventId={eventId} article={article} />
      ) : (
        // `article:read:all` without `article:write:all` is a legitimate
        // combination — show the article rather than bouncing to /forbidden.
        <div className='space-y-4'>
          <h2 className='text-2xl font-semibold'>{article.title}</h2>
          {article.bodyMarkdown.trim() ? (
            <MarkdownContent markdown={article.bodyMarkdown} />
          ) : (
            <p className='text-muted-foreground text-sm'>
              This article has no content yet.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
