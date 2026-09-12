'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  updateEventDescription,
  uploadEventDescriptionAttachment,
} from '@/app/dashboard/admin/events/content-actions';
import { MarkdownEditor } from '@/components/markdown/markdown-editor';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';

type Props = {
  eventId: string;
  initialMarkdown: string;
};

/**
 * Markdown blurb shown to participants on the event page. Edits are explicit
 * (Edit → Save) rather than autosaved, so a half-finished paragraph never
 * lands in front of attendees.
 */
export function EventDescriptionCard({ eventId, initialMarkdown }: Props) {
  const [saved, setSaved] = React.useState(initialMarkdown);
  const [draft, setDraft] = React.useState(initialMarkdown);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // MDXEditor reads its markdown once on mount, so remounting it is the only
  // way to reset the writing surface after a cancel.
  const [editorKey, setEditorKey] = React.useState(0);

  const uploadAttachment = React.useCallback(
    (formData: FormData) => uploadEventDescriptionAttachment(eventId, formData),
    [eventId],
  );

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    const result = await updateEventDescription(eventId, draft);
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSaved(draft);
    setIsEditing(false);
    toast.success('Description saved');
  }

  function handleCancel() {
    setDraft(saved);
    setError(null);
    setIsEditing(false);
    setEditorKey((key) => key + 1);
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between gap-2'>
          <div>
            <CardTitle>Description</CardTitle>
            <CardDescription>
              Shown to participants on the event page. Supports rich text,
              links, tables and images.
            </CardDescription>
          </div>
          {!isEditing && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                setIsEditing(true);
                setEditorKey((key) => key + 1);
              }}
            >
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className='space-y-4'>
            <MarkdownEditor
              key={editorKey}
              value={draft}
              onChange={setDraft}
              uploadAttachment={uploadAttachment}
              onUploadError={setError}
              placeholder='Tell participants what this event is about…'
            />
            {error && <FieldError>{error}</FieldError>}
            <div className='flex justify-end gap-2'>
              <Button type='button' variant='outline' onClick={handleCancel}>
                Cancel
              </Button>
              <Button type='button' onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Description'}
              </Button>
            </div>
          </div>
        ) : saved.trim() ? (
          <MarkdownContent markdown={saved} />
        ) : (
          <p className='text-muted-foreground text-sm'>
            No description yet. Participants see only the event name, dates and
            capacity.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
