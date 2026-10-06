'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ImagePlus, Trash2, Users } from 'lucide-react';

import {
  deleteSubmission,
  getMySubmission,
  heartbeatSubmissionEditor,
  leaveSubmissionEditor,
  saveSubmission,
  setSubmissionPublished,
  uploadSubmissionAttachment,
  type SubmissionEditorPresence,
} from '@/app/dashboard/events/submission-actions';
import {
  publishSubmissionSchema,
  saveSubmissionSchema,
  type SubmissionField,
} from '@/app/dashboard/events/submission-schemas';
import { LocalDateTime } from '@/components/local-date-time';
import { MarkdownEditor } from '@/components/markdown/markdown-editor';
import {
  DELETED_USER_LABEL,
  ProjectStageDescription,
  ProjectStageWarning,
  SubmissionBanner,
  SubmissionStatusBadge,
} from '@/components/submissions/submission-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PROJECT_VISIBILITY_COPY } from '@/lib/submission-copy';
import {
  SUBMISSION_HEARTBEAT_INTERVAL_MS,
  SUBMISSION_TITLE_MAX_LENGTH,
} from '@/lib/submissions';

/** A submission as the editor holds it — instants as ISO strings. */
export type EditableSubmission = {
  title: string;
  markdown: string;
  coverImageUrl: string | null;
  repoUrl: string | null;
  demoUrl: string | null;
  videoUrl: string | null;
  published: boolean;
  updatedAt: string;
  lastEditedByName: string | null;
};

type Content = Pick<
  EditableSubmission,
  'title' | 'markdown' | 'coverImageUrl' | 'repoUrl' | 'demoUrl' | 'videoUrl'
>;

function contentOf(submission: Content): Content {
  return {
    title: submission.title,
    markdown: submission.markdown,
    coverImageUrl: submission.coverImageUrl,
    repoUrl: submission.repoUrl,
    demoUrl: submission.demoUrl,
    videoUrl: submission.videoUrl,
  };
}

function sameContent(a: Content, b: Content): boolean {
  return (
    a.title.trim() === b.title.trim() &&
    a.markdown === b.markdown &&
    a.coverImageUrl === b.coverImageUrl &&
    (a.repoUrl ?? '').trim() === (b.repoUrl ?? '').trim() &&
    (a.demoUrl ?? '').trim() === (b.demoUrl ?? '').trim() &&
    (a.videoUrl ?? '').trim() === (b.videoUrl ?? '').trim()
  );
}

/** Field order on the page, for focusing the first invalid one. */
const FIELD_ORDER: SubmissionField[] = [
  'title',
  'repoUrl',
  'demoUrl',
  'videoUrl',
  'coverImageUrl',
  'markdown',
];

/** The focusable input per field; the markdown editor has none to target. */
const FIELD_INPUT_IDS: Record<SubmissionField, string | null> = {
  title: 'title',
  repoUrl: 'repoUrl',
  demoUrl: 'demoUrl',
  videoUrl: 'videoUrl',
  coverImageUrl: 'cover',
  markdown: null,
};

function issuesByField(
  issues: { path: PropertyKey[]; message: string }[],
): Partial<Record<SubmissionField, string>> {
  const errors: Partial<Record<SubmissionField, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0] as SubmissionField;
    errors[field] ??= issue.message;
  }
  return errors;
}

type Conflict = { updatedAt: string; lastEditedByName: string | null };

/**
 * The team's project editor. Saving never changes the published flag, and a
 * save from a stale copy is refused (the server compares `updatedAt`) so a
 * teammate's newer version isn't overwritten without asking.
 *
 * Every save/publish/validation error renders inline next to the field or
 * the save button; only unpublish and delete, which have no input to fix,
 * report through toasts. See AGENTS.md.
 */
export function SubmissionEditor({
  eventId,
  closesAt,
  currentUserName,
  initial,
}: {
  eventId: string;
  closesAt: string;
  currentUserName: string;
  initial: EditableSubmission;
}) {
  const [saved, setSaved] = React.useState<EditableSubmission>(initial);
  const [content, setContent] = React.useState<Content>(() =>
    contentOf(initial),
  );
  // Remounts the (uncontrolled) markdown editor when content is replaced
  // from the server, e.g. after "Discard mine and reload".
  const [editorKey, setEditorKey] = React.useState(0);
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<SubmissionField, string>>
  >({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<Conflict | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isUploadingCover, setIsUploadingCover] = React.useState(false);
  const coverInput = React.useRef<HTMLInputElement>(null);

  const isDirty = !sameContent(content, contentOf(saved));
  const others = usePresence(eventId);

  function update<K extends keyof Content>(key: K, value: Content[K]) {
    setContent((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  }

  const uploadAttachment = React.useCallback(
    (formData: FormData) => uploadSubmissionAttachment(eventId, formData),
    [eventId],
  );
  const onMarkdownChange = React.useCallback((markdown: string) => {
    setContent((current) => ({ ...current, markdown }));
    setFieldErrors((current) => ({ ...current, markdown: undefined }));
    setFormError(null);
  }, []);
  const onUploadError = React.useCallback(
    (message: string) =>
      setFieldErrors((current) => ({ ...current, markdown: message })),
    [],
  );

  function saveInput(force: boolean) {
    return {
      ...content,
      repoUrl: content.repoUrl ?? '',
      demoUrl: content.demoUrl ?? '',
      videoUrl: content.videoUrl ?? '',
      expectedUpdatedAt: saved.updatedAt,
      force,
    };
  }

  /** Shows `errors` inline and focuses the first field that has one. */
  function showFieldErrors(errors: Partial<Record<SubmissionField, string>>) {
    setFieldErrors(errors);
    const first = FIELD_ORDER.find((field) => errors[field]);
    const id = first && FIELD_INPUT_IDS[first];
    if (id) document.getElementById(id)?.focus();
  }

  /** Resolves true once the content is saved; errors are shown inline. */
  async function save(
    force: boolean,
    { silent = false }: { silent?: boolean } = {},
  ): Promise<boolean> {
    setFormError(null);
    const input = saveInput(force);

    const parsed = saveSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      showFieldErrors(issuesByField(parsed.error.issues));
      return false;
    }

    setIsSaving(true);
    try {
      const result = await saveSubmission(eventId, input);
      if (!result.success) {
        setFormError(result.error);
        return false;
      }
      if (result.data?.status === 'conflict') {
        setConflict({
          updatedAt: new Date(result.data.updatedAt).toISOString(),
          lastEditedByName: result.data.lastEditedByName,
        });
        return false;
      }
      setConflict(null);
      setSaved({
        ...saved,
        title: parsed.data.title,
        markdown: parsed.data.markdown,
        coverImageUrl: parsed.data.coverImageUrl,
        repoUrl: parsed.data.repoUrl,
        demoUrl: parsed.data.demoUrl,
        videoUrl: parsed.data.videoUrl,
        updatedAt: new Date(result.data!.updatedAt).toISOString(),
        lastEditedByName: currentUserName,
      });
      if (!silent) toast.success('Project saved');
      return true;
    } catch {
      setFormError('Unable to save your project. Please try again.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function discardAndReload() {
    setFormError(null);
    const result = await getMySubmission(eventId);
    if (!result.success || !result.data?.submission) {
      setFormError(
        !result.success ? result.error : 'Your project no longer exists.',
      );
      return;
    }
    const fresh = result.data.submission;
    const next: EditableSubmission = {
      ...contentOf(fresh),
      published: fresh.published,
      updatedAt: new Date(fresh.updatedAt).toISOString(),
      lastEditedByName: fresh.lastEditedByName,
    };
    setSaved(next);
    setContent(contentOf(next));
    setFieldErrors({});
    setConflict(null);
    setEditorKey((key) => key + 1);
  }

  /**
   * Checks everything publishing needs, marking each missing or invalid
   * field inline, then saves any pending edits and publishes.
   */
  async function publish() {
    setFormError(null);
    const ready = publishSubmissionSchema.safeParse(content);
    if (!ready.success) {
      showFieldErrors(issuesByField(ready.error.issues));
      return;
    }
    if (isDirty && !(await save(false, { silent: true }))) return;

    setIsPublishing(true);
    try {
      const result = await setSubmissionPublished(eventId, true);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setSaved((current) => ({ ...current, published: true }));
      toast.success(PROJECT_VISIBILITY_COPY.public.madeToast);
    } catch {
      setFormError('Unable to make your project public. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  }

  async function unpublish() {
    setIsPublishing(true);
    const result = await setSubmissionPublished(eventId, false);
    setIsPublishing(false);
    if (!result.success) {
      // A button-only action with no field to anchor an inline error to.
      toast.error(result.error);
      return;
    }
    setSaved((current) => ({ ...current, published: false }));
    toast.success(PROJECT_VISIBILITY_COPY.private.madeToast);
  }

  function togglePublic() {
    void (saved.published ? unpublish() : publish());
  }

  async function handleCoverFile(file: File) {
    setIsUploadingCover(true);
    const formData = new FormData();
    formData.append('file', file);
    const result = await uploadSubmissionAttachment(eventId, formData);
    setIsUploadingCover(false);
    if (!result.success || !result.data) {
      setFieldErrors((current) => ({
        ...current,
        coverImageUrl: !result.success ? result.error : 'Upload failed.',
      }));
      return;
    }
    update('coverImageUrl', result.data.url);
  }

  // The editor only exists while the window is open.
  const stage = saved.published ? 'public' : 'private';

  return (
    <div className='flex flex-col gap-6'>
      <SubmissionBanner
        title={saved.title}
        coverImageUrl={content.coverImageUrl}
        action={<DeleteProjectButton eventId={eventId} />}
      >
        <div>
          <SubmissionStatusBadge
            published={saved.published}
            onToggle={togglePublic}
            disabled={isPublishing || isSaving}
          />
        </div>
        <p className='text-muted-foreground text-sm'>
          <ProjectStageDescription
            stage={stage}
            opensAt={null}
            closesAt={closesAt}
          />
        </p>
        <ProjectStageWarning stage={stage} />
      </SubmissionBanner>

      {others.length > 0 && (
        <div
          role='status'
          className='flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
        >
          <Users className='mt-0.5 size-4 shrink-0' aria-hidden />
          <span>
            {others.map((other) => other.name).join(', ')}{' '}
            {others.length === 1 ? 'is' : 'are'} also editing — saving may
            overwrite their changes.
          </span>
        </div>
      )}

      <Card className='p-6'>
        <form
          className='flex flex-col gap-6'
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <FieldGroup className='gap-4'>
            <Field data-invalid={!!fieldErrors.title}>
              <FieldLabel htmlFor='title'>
                Project title <span className='text-destructive'>*</span>
              </FieldLabel>
              <Input
                id='title'
                value={content.title}
                maxLength={SUBMISSION_TITLE_MAX_LENGTH}
                aria-invalid={!!fieldErrors.title}
                onChange={(event) => update('title', event.target.value)}
              />
              {fieldErrors.title && (
                <FieldError>{fieldErrors.title}</FieldError>
              )}
            </Field>

            <div className='grid gap-4 md:grid-cols-3'>
              <Field data-invalid={!!fieldErrors.repoUrl}>
                <FieldLabel htmlFor='repoUrl'>
                  Repository <span className='text-destructive'>*</span>
                </FieldLabel>
                <Input
                  id='repoUrl'
                  type='url'
                  inputMode='url'
                  placeholder='https://github.com/…'
                  value={content.repoUrl ?? ''}
                  aria-invalid={!!fieldErrors.repoUrl}
                  onChange={(event) => update('repoUrl', event.target.value)}
                />
                {fieldErrors.repoUrl && (
                  <FieldError>{fieldErrors.repoUrl}</FieldError>
                )}
              </Field>
              <Field data-invalid={!!fieldErrors.demoUrl}>
                <FieldLabel htmlFor='demoUrl'>Live demo</FieldLabel>
                <Input
                  id='demoUrl'
                  type='url'
                  inputMode='url'
                  placeholder='https://…'
                  value={content.demoUrl ?? ''}
                  aria-invalid={!!fieldErrors.demoUrl}
                  onChange={(event) => update('demoUrl', event.target.value)}
                />
                {fieldErrors.demoUrl && (
                  <FieldError>{fieldErrors.demoUrl}</FieldError>
                )}
              </Field>
              <Field data-invalid={!!fieldErrors.videoUrl}>
                <FieldLabel htmlFor='videoUrl'>Video</FieldLabel>
                <Input
                  id='videoUrl'
                  type='url'
                  inputMode='url'
                  placeholder='https://youtu.be/…'
                  value={content.videoUrl ?? ''}
                  aria-invalid={!!fieldErrors.videoUrl}
                  onChange={(event) => update('videoUrl', event.target.value)}
                />
                {fieldErrors.videoUrl && (
                  <FieldError>{fieldErrors.videoUrl}</FieldError>
                )}
              </Field>
            </div>

            <Field data-invalid={!!fieldErrors.coverImageUrl}>
              <FieldLabel htmlFor='cover'>Cover image</FieldLabel>
              <div className='flex flex-wrap gap-2'>
                <input
                  ref={coverInput}
                  id='cover'
                  type='file'
                  accept='image/jpeg,image/png,image/webp,image/gif,image/avif'
                  className='sr-only'
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void handleCoverFile(file);
                  }}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={isUploadingCover}
                  onClick={() => coverInput.current?.click()}
                >
                  <ImagePlus data-icon='inline-start' />
                  {isUploadingCover
                    ? 'Uploading…'
                    : content.coverImageUrl
                      ? 'Replace cover'
                      : 'Upload cover'}
                </Button>
                {content.coverImageUrl && (
                  <RemoveCoverButton
                    onConfirm={() => update('coverImageUrl', null)}
                  />
                )}
              </div>
              {fieldErrors.coverImageUrl && (
                <FieldError>{fieldErrors.coverImageUrl}</FieldError>
              )}
            </Field>

            <Field data-invalid={!!fieldErrors.markdown}>
              <FieldLabel>Write-up</FieldLabel>
              <MarkdownEditor
                key={editorKey}
                value={content.markdown}
                onChange={onMarkdownChange}
                uploadAttachment={uploadAttachment}
                onUploadError={onUploadError}
                allowRawHtml={false}
                placeholder='What you built, how it works, and what it looks like. Paste or drop images straight in.'
              />
              {fieldErrors.markdown && (
                <FieldError>{fieldErrors.markdown}</FieldError>
              )}
            </Field>
          </FieldGroup>

          {conflict && (
            <div
              role='alert'
              className='border-destructive/40 bg-destructive/5 flex flex-col gap-3 rounded-md border px-4 py-3 text-sm'
            >
              <p>
                A teammate saved a newer version
                {conflict.lastEditedByName
                  ? ` (${conflict.lastEditedByName})`
                  : ` (${DELETED_USER_LABEL})`}{' '}
                at{' '}
                <LocalDateTime
                  value={conflict.updatedAt}
                  dateStyle='medium'
                  timeStyle='short'
                />
                . Your changes weren&apos;t saved.
              </p>
              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='destructive'
                  size='sm'
                  disabled={isSaving}
                  onClick={() => void save(true)}
                >
                  Overwrite with mine
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={isSaving}
                  onClick={() => void discardAndReload()}
                >
                  Discard mine and reload
                </Button>
              </div>
            </div>
          )}

          <div className='flex flex-col gap-3'>
            {formError && <FieldError role='alert'>{formError}</FieldError>}
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-muted-foreground text-xs'>
                Last saved by {saved.lastEditedByName ?? DELETED_USER_LABEL} on{' '}
                <LocalDateTime
                  value={saved.updatedAt}
                  dateStyle='medium'
                  timeStyle='short'
                />
              </p>
              <Button type='submit' disabled={isSaving || !isDirty}>
                {isSaving ? 'Saving…' : isDirty ? 'Save project' : 'Saved'}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}

/**
 * Keeps this member's presence row fresh while the tab is visible, and
 * returns the teammates the server says are editing too. Refreshed on every
 * heartbeat response; cleared (best effort) when the editor goes away.
 */
function usePresence(eventId: string): SubmissionEditorPresence[] {
  const [others, setOthers] = React.useState<SubmissionEditorPresence[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    const beat = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const result = await heartbeatSubmissionEditor(eventId);
        if (!cancelled && result.success) setOthers(result.data ?? []);
      } catch {
        // Presence is advisory; a missed beat just ages out.
      }
    };
    const leave = () => {
      void leaveSubmissionEditor(eventId).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void beat();
    };

    void beat();
    const timer = setInterval(beat, SUBMISSION_HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [eventId]);

  return others;
}

function RemoveCoverButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        aria-label='Remove cover'
        title='Remove cover'
        className='hover:text-destructive'
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Remove the cover image?</DialogTitle>
            <DialogDescription>
              Your project will show without a cover once you save.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              Remove cover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteProjectButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteSubmission(eventId);
    setIsDeleting(false);
    if (!result.success) {
      // A button-only action with no field to anchor an inline error to.
      toast.error(result.error);
      return;
    }
    setOpen(false);
    toast.success('Project deleted');
  }

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='icon'
        aria-label='Delete project'
        title='Delete project'
        className='bg-background/80 hover:text-destructive backdrop-blur-sm'
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Delete your project?</DialogTitle>
            <DialogDescription>
              This deletes the write-up, links and images for your whole team.
              It can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
