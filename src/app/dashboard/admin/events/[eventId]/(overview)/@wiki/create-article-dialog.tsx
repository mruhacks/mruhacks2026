'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

import { createEventArticle } from '@/app/dashboard/admin/events/content-actions';
import { slugify } from '@/lib/slug';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/**
 * The wiki cell's "Add" action. Creates an empty draft and goes straight to
 * its page, since a new article has nothing to show in the list until its
 * body is written.
 *
 * No local copy of the article list is kept here: `createEventArticle`
 * revalidates this route, so the new row arrives with the server re-render
 * that ships in the action's own response.
 */
export function CreateArticleDialog({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  const derivedSlug = slugify(title);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Reopening starts clean rather than showing the last attempt's error.
    if (!next) {
      setTitle('');
      setSlug('');
      setError(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }

    setIsCreating(true);
    const result = await createEventArticle(eventId, {
      title: trimmedTitle,
      ...(slug.trim() ? { slug: slug.trim() } : {}),
    });
    setIsCreating(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    const created = result.data;
    handleOpenChange(false);
    toast.success('Draft article created');
    // Always present on a successful create; the check is only here because
    // `ActionResult`'s payload is optional by type.
    if (created) {
      router.push(`/dashboard/admin/events/${eventId}/articles/${created.id}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant='ghost' size='sm'>
          <Plus aria-hidden className='size-4' />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>New article</DialogTitle>
          <DialogDescription>
            Articles start as drafts — publish one once it is ready for
            participants.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <Field>
            <FieldLabel htmlFor='new-article-title'>Title</FieldLabel>
            <Input
              id='new-article-title'
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setError(null);
              }}
              placeholder='e.g. Getting started'
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='new-article-slug'>
              URL slug (optional)
            </FieldLabel>
            <FieldDescription>
              {derivedSlug
                ? `Defaults to "${derivedSlug}".`
                : 'Derived from the title.'}
            </FieldDescription>
            <Input
              id='new-article-slug'
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setError(null);
              }}
              placeholder={derivedSlug || 'getting-started'}
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
