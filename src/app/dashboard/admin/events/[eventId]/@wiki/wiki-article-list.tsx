'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';

import {
  createEventArticle,
  deleteEventArticle,
  listEventArticles,
  updateEventArticle,
  type ArticleSummary,
} from '@/app/dashboard/admin/events/content-actions';
import { slugifyArticleTitle } from '@/lib/article-slug';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Props = {
  eventId: string;
  articles: ArticleSummary[];
  canWrite: boolean;
};

export function WikiArticleList({ eventId, articles, canWrite }: Props) {
  // Seeded from the server render, then kept current by refetching through
  // the same action after each mutation — targeted, and it leaves the rest of
  // the event page (and its open tab state) alone.
  const [rows, setRows] = React.useState(articles);
  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    React.useState<ArticleSummary | null>(null);

  const derivedSlug = slugifyArticleTitle(title);

  async function reload() {
    const result = await listEventArticles(eventId);
    if (result.success && result.data) setRows(result.data);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreateError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setCreateError('Title is required.');
      return;
    }

    setIsCreating(true);
    const result = await createEventArticle(eventId, {
      title: trimmedTitle,
      ...(slug.trim() ? { slug: slug.trim() } : {}),
    });
    setIsCreating(false);

    if (!result.success) {
      setCreateError(result.error);
      return;
    }
    setTitle('');
    setSlug('');
    await reload();
    toast.success('Draft article created');
  }

  async function handleTogglePublished(article: ArticleSummary) {
    setBusyId(article.id);
    const result = await updateEventArticle(eventId, article.id, {
      published: !article.published,
    });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    await reload();
    toast.success(
      article.published ? 'Article unpublished' : 'Article published',
    );
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    const result = await deleteEventArticle(eventId, pendingDelete.id);
    setBusyId(null);
    setPendingDelete(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    await reload();
    toast.success('Article deleted');
  }

  return (
    <div className='space-y-4'>
      {canWrite && (
        <Card>
          <CardContent className='pt-6'>
            <form onSubmit={handleCreate} className='space-y-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor='article-title'>Title</FieldLabel>
                  <Input
                    id='article-title'
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setCreateError(null);
                    }}
                    placeholder='e.g. Getting started'
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='article-slug'>
                    URL slug (optional)
                  </FieldLabel>
                  <FieldDescription>
                    {derivedSlug
                      ? `Defaults to "${derivedSlug}".`
                      : 'Derived from the title.'}
                  </FieldDescription>
                  <Input
                    id='article-slug'
                    value={slug}
                    onChange={(event) => {
                      setSlug(event.target.value);
                      setCreateError(null);
                    }}
                    placeholder={derivedSlug || 'getting-started'}
                  />
                </Field>
              </div>
              {createError && <FieldError>{createError}</FieldError>}
              <div className='flex justify-end'>
                <Button type='submit' disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'New article'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          No articles yet.
          {canWrite ? ' Create one above to start the wiki.' : ''}
        </p>
      ) : (
        <ul className='divide-y rounded-md border'>
          {rows.map((article) => (
            <li
              key={article.id}
              className='flex flex-wrap items-center justify-between gap-3 p-4'
            >
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <span className='truncate font-medium'>{article.title}</span>
                  <Badge variant={article.published ? 'success' : 'outline'}>
                    {article.published ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                <p className='text-muted-foreground mt-1 truncate text-xs'>
                  /{article.slug} · updated{' '}
                  {new Date(article.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className='flex items-center gap-2'>
                {canWrite && (
                  <>
                    <Button asChild variant='outline' size='sm'>
                      <Link
                        href={`/dashboard/admin/events/${eventId}?tab=wiki&article=${article.id}`}
                      >
                        <Pencil className='mr-1.5 size-4' />
                        Edit
                      </Link>
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={busyId === article.id}
                      onClick={() => handleTogglePublished(article)}
                    >
                      {article.published ? (
                        <EyeOff className='mr-1.5 size-4' />
                      ) : (
                        <Eye className='mr-1.5 size-4' />
                      )}
                      {article.published ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      className='text-destructive'
                      disabled={busyId === article.id}
                      onClick={() => setPendingDelete(article)}
                    >
                      <Trash2 className='size-4' />
                      <span className='sr-only'>Delete {article.title}</span>
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete article?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.title}” and any images only it used will be
              permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant='destructive'
              disabled={busyId === pendingDelete?.id}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
