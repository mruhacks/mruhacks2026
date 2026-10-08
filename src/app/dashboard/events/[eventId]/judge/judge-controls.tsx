'use client';

/**
 * The few interactive pieces of the judge screen. Everything else is
 * server-rendered: these submit forms to the judge actions, which refresh
 * the page with wherever the judge goes next.
 */

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { NotebookPen, X } from 'lucide-react';

import { saveJudgeNote } from '@/app/dashboard/events/judge-actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { JUDGE_NOTE_MAX_LENGTH } from '@/lib/judging/limits';
import type { JudgeProjectCard } from '@/lib/judging/judge-session';
import { cn } from '@/lib/utils';

import { BIG, GO, SKIP } from './judge-styles';

type FormAction = (
  formData: FormData,
) => Promise<{ success: boolean; error?: string }>;

const OFFLINE = 'Couldn’t reach the server. Check your connection.';

/**
 * A form for one of the judge actions. Its controls are disabled while it's
 * submitting, and a failure shows under it until the judge changes anything.
 */
export function ActionForm({
  action,
  onSuccess,
  className,
  children,
}: {
  action: FormAction;
  onSuccess?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [error, setError] = React.useState<string>();
  return (
    <form
      className={className}
      onChange={() => setError(undefined)}
      action={async (formData) => {
        setError(undefined);
        try {
          const result = await action(formData);
          if (!result.success) return setError(result.error);
          onSuccess?.();
          window.scrollTo({ top: 0 });
        } catch {
          setError(OFFLINE);
        }
      }}
    >
      <PendingFieldset>{children}</PendingFieldset>
      {error && <FieldError className='mt-2 text-center'>{error}</FieldError>}
    </form>
  );
}

function PendingFieldset({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <fieldset disabled={pending} className='contents'>
      {children}
    </fieldset>
  );
}

/** Shows a spinner in place of `icon` while its form submits. */
export function SubmitButton({
  icon,
  iconEnd,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'type'> & {
  icon?: React.ReactNode;
  iconEnd?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type='submit' className={className} {...props}>
      {pending ? <Spinner /> : icon}
      {children}
      {!pending && iconEnd}
    </Button>
  );
}

/** Asks why before skipping: not here may come back, a conflict won't. */
export function SkipButton({
  action,
  currentId,
}: {
  action: FormAction;
  currentId: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        type='button'
        className={cn(BIG, SKIP)}
        onClick={() => setOpen(true)}
      >
        <X />
        Skip
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why are you skipping it?</DialogTitle>
            <DialogDescription>
              If the team isn&apos;t here you may be sent back later. A conflict
              of interest means you won&apos;t see this project again.
            </DialogDescription>
          </DialogHeader>
          <ActionForm
            action={action}
            onSuccess={() => setOpen(false)}
            className='flex flex-col gap-2'
          >
            <input type='hidden' name='currentId' value={currentId} />
            <SubmitButton
              name='reason'
              value='not_here'
              className={cn(BIG, SKIP)}
            >
              Team not here
            </SubmitButton>
            <SubmitButton
              name='reason'
              value='conflict'
              className={cn(BIG, SKIP)}
            >
              Conflict of interest
            </SubmitButton>
            <Button
              type='button'
              variant='ghost'
              size='lg'
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** While there's nothing to do yet, check back this often. */
const IDLE_POLL_MS = 30_000;

/**
 * Re-renders the page on a timer while there's nothing to do (not open yet,
 * no criteria, no projects left), so the judge doesn't have to keep reloading.
 */
export function AutoRefresh() {
  const router = useRouter();
  React.useEffect(() => {
    const id = window.setInterval(() => {
      // The judge screen is rendered by Server Components, not a React Query
      // cache.
      // eslint-disable-next-line custom/no-router-refresh
      if (document.visibilityState === 'visible') router.refresh();
    }, IDLE_POLL_MS);
    return () => window.clearInterval(id);
  }, [router]);
  return null;
}

/**
 * Notes live behind a button so the voting controls keep the screen. The
 * saved text is held here rather than in the dialog, which unmounts on close.
 */
export function NotesButton({
  eventId,
  project,
  previous,
}: {
  eventId: string;
  project: JudgeProjectCard;
  previous?: JudgeProjectCard;
}) {
  const [open, setOpen] = React.useState(false);
  const [saved, setSaved] = React.useState(project.note);
  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={() => setOpen(true)}
      >
        <NotebookPen />
        {saved ? 'Notes ✓' : 'Notes'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notes</DialogTitle>
            <DialogDescription>Only you can see these.</DialogDescription>
          </DialogHeader>
          <NoteEditor
            eventId={eventId}
            project={project}
            initial={saved}
            onSaved={setSaved}
          />
          {previous?.note && (
            <div className='bg-muted rounded-lg p-3'>
              <p className='text-muted-foreground m-0 text-xs font-medium uppercase'>
                Your note on Table {previous.tableLabel}
              </p>
              <p className='m-0 text-sm whitespace-pre-wrap'>{previous.note}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function NoteEditor({
  eventId,
  project,
  initial,
  onSaved,
}: {
  eventId: string;
  project: JudgeProjectCard;
  initial: string;
  onSaved: (body: string) => void;
}) {
  const [body, setBody] = React.useState(initial);
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await saveJudgeNote(eventId, {
        submissionId: project.id,
        body,
      });
      if (!result.success) return setError(result.error);
      onSaved(body);
    } catch {
      setError(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className='flex flex-col gap-2'>
      <label htmlFor={`note-${project.id}`} className='text-sm font-medium'>
        Table {project.tableLabel} · <em>{project.title}</em>
      </label>
      <Textarea
        id={`note-${project.id}`}
        value={body}
        rows={5}
        maxLength={JUDGE_NOTE_MAX_LENGTH}
        placeholder='What stood out?'
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setBody(e.target.value);
          setError(undefined);
        }}
      />
      {error && <FieldError>{error}</FieldError>}
      <Button
        type='submit'
        size='lg'
        className={GO}
        disabled={saving || body === initial}
      >
        {saving && <Spinner data-icon='inline-start' />}
        {body === initial && initial ? 'Saved' : 'Save note'}
      </Button>
    </form>
  );
}
