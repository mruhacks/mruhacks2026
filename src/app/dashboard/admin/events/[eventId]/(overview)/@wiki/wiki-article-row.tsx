'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';

import {
  deleteEventArticle,
  updateEventArticle,
} from '@/app/dashboard/admin/events/content-actions';
import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useEventBasePath } from '../../_components/use-event-base-path';

/** Exactly what `getAllArticlesForAdmin` returns per row. */
export type WikiArticleRowData = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  updatedAt: Date;
};

/**
 * One row of the wiki cell: the row opens the article on its own page, and
 * the menu carries the publish toggle and the delete that used to live on the
 * `/wiki` index. Only the editor still needs a page of its own — it needs the
 * width the bento cell doesn't have.
 *
 * Both mutations revalidate this route, so the row re-renders from the server
 * within the action's own response — nothing here mirrors the article list in
 * client state.
 */
export function WikiArticleRow({
  eventId,
  article,
  canWrite,
  dragHandle,
  disabled = false,
}: {
  eventId: string;
  article: WikiArticleRowData;
  canWrite: boolean;
  dragHandle?: React.ReactNode;
  disabled?: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);

  const basePath = useEventBasePath();

  const articleHref = `${basePath}/articles/${article.id}`;

  async function handleTogglePublished() {
    setIsBusy(true);
    const result = await updateEventArticle(eventId, article.id, {
      published: !article.published,
    });
    setIsBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(
      article.published ? 'Article unpublished' : 'Article published',
    );
  }

  async function handleDelete() {
    setIsBusy(true);
    const result = await deleteEventArticle(eventId, article.id);
    setIsBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setConfirmingDelete(false);
    toast.success('Article deleted');
  }

  return (
    <div className='hover:bg-accent/50 relative flex items-center gap-2 px-6 py-3'>
      {/* `after:inset-0` stretches the link over the whole row, which leaves
          room beside it for the menu — positioned, so it stays clickable. */}
      <Link
        href={articleHref}
        className='flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0'
      >
        <FileText
          aria-hidden
          className='text-muted-foreground size-4 shrink-0'
        />
        <span className='min-w-0'>
          <span className='block truncate text-sm font-medium'>
            {article.title}
          </span>
          <span className='text-muted-foreground block truncate text-xs'>
            /{article.slug} · updated{' '}
            <LocalDateTime value={article.updatedAt} dateStyle='medium' />
          </span>
        </span>
      </Link>

      {dragHandle}

      {!article.published && (
        <Badge variant='secondary' className='shrink-0'>
          Draft
        </Badge>
      )}

      {canWrite && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon-sm'
              className='relative shrink-0'
              disabled={isBusy || disabled}
            >
              <MoreHorizontal className='size-4' />
              <span className='sr-only'>Actions for {article.title}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem asChild>
              <Link href={articleHref}>
                <Pencil className='size-4' /> Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleTogglePublished}>
              {article.published ? (
                <EyeOff className='size-4' />
              ) : (
                <Eye className='size-4' />
              )}
              {article.published ? 'Unpublish' : 'Publish'}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant='destructive'
              onSelect={() => setConfirmingDelete(true)}
            >
              <Trash2 className='size-4' /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => !open && setConfirmingDelete(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete article?</DialogTitle>
            <DialogDescription>
              “{article.title}” and any images only it used will be permanently
              removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              disabled={isBusy}
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
