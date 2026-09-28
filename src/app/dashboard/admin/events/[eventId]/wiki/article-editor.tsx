'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  updateEventArticle,
  uploadArticleAttachment,
  type ArticleDetail,
} from '@/app/dashboard/admin/events/content-actions';
import { MarkdownEditor } from '@/components/markdown/markdown-editor';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type Props = {
  eventId: string;
  article: ArticleDetail;
};

export function ArticleEditor({ eventId, article }: Props) {
  const [title, setTitle] = React.useState(article.title);
  const [slug, setSlug] = React.useState(article.slug);
  const [body, setBody] = React.useState(article.bodyMarkdown);
  const [published, setPublished] = React.useState(article.published);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const uploadAttachment = React.useCallback(
    (formData: FormData) => uploadArticleAttachment(eventId, formData),
    [eventId],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setIsSaving(true);
    const result = await updateEventArticle(eventId, article.id, {
      title: title.trim(),
      slug: slug.trim(),
      bodyMarkdown: body,
      published,
    });
    setIsSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    toast.success('Article saved');
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field>
          <FieldLabel htmlFor='title'>Title</FieldLabel>
          <Input
            id='title'
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='slug'>URL slug</FieldLabel>
          <FieldDescription>
            Participants read this at /dashboard/events/{eventId}/wiki/
            {slug || article.slug}
          </FieldDescription>
          <Input
            id='slug'
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setError(null);
            }}
          />
        </Field>
      </div>

      <div className='flex items-center gap-3'>
        <Switch
          id='published'
          checked={published}
          onCheckedChange={setPublished}
        />
        <Label htmlFor='published'>
          Published — visible to participants of this event
        </Label>
      </div>

      <MarkdownEditor
        value={article.bodyMarkdown}
        onChange={setBody}
        uploadAttachment={uploadAttachment}
        onUploadError={setError}
        placeholder='Write the article…'
      />

      {error && <FieldError>{error}</FieldError>}

      <div className='flex justify-end'>
        <Button type='submit' disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save article'}
        </Button>
      </div>
    </form>
  );
}
