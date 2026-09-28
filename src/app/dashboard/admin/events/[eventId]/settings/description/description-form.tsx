'use client';

import * as React from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  updateEventDescription,
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

export function DescriptionForm({
  eventId,
  initialMarkdown,
}: {
  eventId: string;
  initialMarkdown: string;
}) {
  const router = useRouter();
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
      const result = await updateEventDescription(eventId, draft);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success('Description saved');
      // The overview reads this description through a Server Component.
      // eslint-disable-next-line custom/no-router-refresh
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      setError('Unable to save the description. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className='gap-4 py-5'>
      <CardHeader className='gap-1 px-5'>
        <CardTitle>Edit description</CardTitle>
        <CardDescription>
          Shown to participants on the event page.
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
                placeholder='Tell participants what this event is about…'
              />
              {error && <FieldError role='alert'>{error}</FieldError>}
            </Field>
          </FieldGroup>
          <div className='flex flex-wrap justify-end gap-2'>
            <Button asChild variant='outline'>
              <Link href={`/dashboard/admin/events/${eventId}/settings`}>
                Back to edit event
              </Link>
            </Button>
            <Button type='submit' disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save description'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
