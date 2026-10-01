'use client';

import * as React from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  updateEventDescription,
  updateEventTerms,
  uploadEventDescriptionAttachment,
} from '@/app/dashboard/admin/events/content-actions';
import { MarkdownEditor } from '@/components/markdown/markdown-editor';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';

import { useEventBasePath } from '../_components/use-event-base-path';

export function EventContentForm({
  eventId,
  initialMarkdown,
  kind = 'description',
}: {
  eventId: string;
  initialMarkdown: string;
  kind?: 'description' | 'terms';
}) {
  const isTerms = kind === 'terms';
  const label = isTerms ? 'Event Terms' : 'description';
  const router = useRouter();
  const basePath = useEventBasePath();
  const [draft, setDraft] = React.useState(initialMarkdown);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const uploadAttachment = React.useCallback(
    (formData: FormData) => uploadEventDescriptionAttachment(eventId, formData),
    [eventId],
  );

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await (
        isTerms ? updateEventTerms : updateEventDescription
      )(eventId, draft);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(isTerms ? 'Event terms saved' : 'Description saved');
      // The overview reads this description through a Server Component.
      // eslint-disable-next-line custom/no-router-refresh
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      setError(`Unable to save ${label}. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className='gap-4 py-5'>
      <CardHeader className='gap-1 px-5'>
        <CardTitle>Edit {label}</CardTitle>
        <CardDescription>
          {isTerms
            ? 'Participants must agree to these terms before accepting their RSVP. Leave empty if no event terms are required. Changes apply to future acceptances; previous consent records are preserved.'
            : 'Shown to participants on the event page.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='px-5'>
        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
          <FieldGroup>
            <Field data-invalid={!!error}>
              <MarkdownEditor
                value={draft}
                onChange={(value) => {
                  setError(null);
                  setDraft(value);
                }}
                uploadAttachment={uploadAttachment}
                onUploadError={setError}
                placeholder={
                  isTerms
                    ? 'Add the rules and terms for attending this event…'
                    : 'Tell participants what this event is about…'
                }
              />
              {error && <FieldError role='alert'>{error}</FieldError>}
            </Field>
          </FieldGroup>
          <div className='flex flex-wrap justify-end gap-2'>
            <Button asChild variant='outline'>
              <Link href={basePath}>Back to event overview</Link>
            </Button>
            <Button type='submit' disabled={isSaving}>
              {isSaving ? 'Saving…' : `Save ${label}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
