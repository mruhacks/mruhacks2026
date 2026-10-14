'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

import {
  previewCampaignEmail,
  sendCampaignTest,
  updateCampaignContent,
  uploadCampaignImage,
} from '@/app/dashboard/admin/campaigns/actions';
import { mergeFieldError } from '@/lib/campaigns/merge-fields';
import type { CampaignDetail } from '@/lib/campaigns/queries';
import { MarkdownEditor } from '@/components/markdown/markdown-editor';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

const AUTOSAVE_DELAY_MS = 1500;
const PREVIEW_DELAY_MS = 600;

type Content = {
  name: string;
  subject: string;
  previewText: string;
  bodyMarkdown: string;
};

type SaveState =
  | { kind: 'saved' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function CampaignComposer({
  campaign,
  editable,
  canSendTest,
}: {
  campaign: CampaignDetail;
  /** Draft and `campaign:write:all`. */
  editable: boolean;
  /** `campaign:write:all` — test sends work in any status. */
  canSendTest: boolean;
}) {
  const [content, setContent] = React.useState<Content>({
    name: campaign.name,
    subject: campaign.subject,
    previewText: campaign.previewText,
    bodyMarkdown: campaign.bodyMarkdown,
  });
  const [saveState, setSaveState] = React.useState<SaveState>({
    kind: 'saved',
  });
  const [testError, setTestError] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [isSendingTest, setIsSendingTest] = React.useState(false);

  const fieldErrors = {
    subject: mergeFieldError(content.subject),
    previewText: mergeFieldError(content.previewText),
    bodyMarkdown: mergeFieldError(content.bodyMarkdown),
  };
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  const update = (patch: Partial<Content>) => {
    setContent((current) => ({ ...current, ...patch }));
    setSaveState({ kind: 'dirty' });
    setTestError(null);
  };

  // Autosave. Skipped while a merge field is unknown: the server would refuse
  // it anyway, and the inline error already says why.
  const latest = React.useRef(content);
  React.useEffect(() => {
    latest.current = content;
  }, [content]);
  const save = React.useCallback(async (): Promise<boolean> => {
    setSaveState({ kind: 'saving' });
    const snapshot = latest.current;
    const result = await updateCampaignContent(campaign.id, snapshot);
    if (!result.success) {
      setSaveState({ kind: 'error', message: result.error });
      return false;
    }
    // Edits made while saving stay dirty and save on the next tick.
    setSaveState(
      latest.current === snapshot ? { kind: 'saved' } : { kind: 'dirty' },
    );
    return true;
  }, [campaign.id]);

  React.useEffect(() => {
    if (!editable || saveState.kind !== 'dirty' || hasFieldErrors) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [content, editable, saveState.kind, hasFieldErrors, save]);

  const previewInput = useDebounced(
    {
      subject: content.subject,
      previewText: content.previewText,
      bodyMarkdown: content.bodyMarkdown,
    },
    PREVIEW_DELAY_MS,
  );
  const preview = useQuery({
    queryKey: ['campaign-email-preview', campaign.id, previewInput],
    queryFn: async () => {
      const result = await previewCampaignEmail(campaign.id, previewInput);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
    placeholderData: (previous) => previous,
  });

  async function sendTest() {
    setTestError(null);
    if (hasFieldErrors) {
      setTestError('Fix the merge fields above first.');
      return;
    }
    setIsSendingTest(true);
    const saved = saveState.kind === 'saved' || !editable || (await save());
    const result = saved
      ? await sendCampaignTest(campaign.id)
      : { success: false as const, error: 'Save the draft first.' };
    setIsSendingTest(false);
    if (!result.success) {
      setTestError(result.error);
      return;
    }
    toast.success(`Test sent to ${result.data!.to}`);
  }

  return (
    <div className='grid gap-6 lg:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Use <code>{'{{firstName}}'}</code> for the recipient&apos;s first
            name (it falls back to &quot;there&quot;, or{' '}
            <code>{'{{firstName|friend}}'}</code> picks your own).
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Field>
            <FieldLabel htmlFor='campaign-name-input'>Campaign name</FieldLabel>
            <Input
              id='campaign-name-input'
              value={content.name}
              disabled={!editable}
              onChange={(e) => update({ name: e.target.value })}
            />
            <FieldDescription>Only organizers see this.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor='campaign-subject'>Subject</FieldLabel>
            <Input
              id='campaign-subject'
              value={content.subject}
              disabled={!editable}
              aria-invalid={Boolean(fieldErrors.subject)}
              onChange={(e) => update({ subject: e.target.value })}
            />
            {fieldErrors.subject && (
              <FieldError>{fieldErrors.subject}</FieldError>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor='campaign-preview-text'>
              Preview text
            </FieldLabel>
            <Input
              id='campaign-preview-text'
              value={content.previewText}
              disabled={!editable}
              aria-invalid={Boolean(fieldErrors.previewText)}
              placeholder='Shown next to the subject in most inboxes'
              onChange={(e) => update({ previewText: e.target.value })}
            />
            {fieldErrors.previewText && (
              <FieldError>{fieldErrors.previewText}</FieldError>
            )}
          </Field>
          <Field>
            <FieldLabel>Body</FieldLabel>
            {editable ? (
              <MarkdownEditor
                value={campaign.bodyMarkdown}
                onChange={(bodyMarkdown) => {
                  update({ bodyMarkdown });
                  setUploadError(null);
                }}
                uploadAttachment={uploadCampaignImage}
                onUploadError={setUploadError}
                profile='email'
                placeholder='Write your email…'
              />
            ) : (
              <p className='text-muted-foreground text-sm'>
                This campaign can no longer be edited. The preview shows what
                was sent.
              </p>
            )}
            {fieldErrors.bodyMarkdown && (
              <FieldError>{fieldErrors.bodyMarkdown}</FieldError>
            )}
            {uploadError && <FieldError>{uploadError}</FieldError>}
          </Field>

          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            {editable ? <SaveStatus state={saveState} /> : <span />}
            {canSendTest && (
              <Button
                type='button'
                variant='outline'
                onClick={sendTest}
                disabled={isSendingTest}
              >
                <Send /> {isSendingTest ? 'Sending…' : 'Send test to me'}
              </Button>
            )}
          </div>
          {saveState.kind === 'error' && (
            <FieldError>{saveState.message}</FieldError>
          )}
          {testError && <FieldError>{testError}</FieldError>}
        </CardContent>
      </Card>

      <Card className='lg:sticky lg:top-24 lg:self-start'>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription className='truncate'>
            {preview.data?.subject ? (
              <>Subject: {preview.data.subject}</>
            ) : (
              'No subject yet'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {preview.isError ? (
            <FieldError>{preview.error.message}</FieldError>
          ) : preview.data ? (
            <iframe
              title='Email preview'
              // No scripts, forms or same-origin access: it's a static render.
              sandbox=''
              srcDoc={preview.data.html}
              className='h-[640px] w-full rounded-md border bg-white'
            />
          ) : (
            <div className='flex h-40 items-center justify-center'>
              <Spinner />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const text =
    state.kind === 'saved'
      ? 'All changes saved'
      : state.kind === 'saving'
        ? 'Saving…'
        : state.kind === 'dirty'
          ? 'Unsaved changes'
          : 'Not saved';
  return (
    <span className='text-muted-foreground text-xs' aria-live='polite'>
      {text}
    </span>
  );
}
