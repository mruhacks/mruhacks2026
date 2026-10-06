'use client';

import * as React from 'react';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';

import {
  beginJudging,
  getJudgeView,
  saveJudgeNote,
  skipJudgeProject,
  submitJudgeVote,
  type JudgeProjectCard,
  type JudgeView,
} from '@/app/judge/actions';
import { LocalDateTime } from '@/components/local-date-time';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { JUDGE_NOTE_MAX_LENGTH } from '@/lib/judging/limits';
import { cn } from '@/lib/utils';

/** While there's nothing to do yet, check back this often. */
const IDLE_POLL_MS = 30_000;

type Side = 'previous' | 'current';

/**
 * The judge's screen. Holds only the current `JudgeView`: every action
 * returns the next one, so the server alone decides where the judge goes.
 */
export function JudgeConsole({ eventId }: { eventId: string }) {
  const [view, setView] = React.useState<JudgeView | null>(null);
  const [pending, setPending] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setView(await getJudgeView(eventId));
    } catch {
      toast.error('Couldn’t reach the server. Check your connection.');
    }
  }, [eventId]);

  React.useEffect(() => {
    let cancelled = false;
    getJudgeView(eventId).then(
      (next) => {
        if (!cancelled) setView(next);
      },
      () => toast.error('Couldn’t reach the server. Check your connection.'),
    );
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Nothing to do right now (not open yet, no criteria, no projects left):
  // check back on our own so the judge doesn't have to keep reloading.
  const idle =
    view?.kind === 'waiting' ||
    view?.kind === 'not_open' ||
    view?.kind === 'no_criteria';
  React.useEffect(() => {
    if (!idle) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, IDLE_POLL_MS);
    return () => window.clearInterval(id);
  }, [idle, load]);

  /** Vote, begin and skip are button-only actions, so failures toast. */
  async function run(
    action: () => Promise<{
      success: boolean;
      error?: string;
      data?: JudgeView;
    }>,
  ) {
    setPending(true);
    try {
      const result = await action();
      if (!result.success) toast.error(result.error);
      else if (result.data) {
        setView(result.data);
        window.scrollTo({ top: 0 });
      }
    } catch {
      toast.error('Couldn’t reach the server. Check your connection.');
    } finally {
      setPending(false);
    }
  }

  if (!view) {
    return (
      <div className='flex justify-center py-16'>
        <Spinner />
      </div>
    );
  }

  switch (view.kind) {
    case 'not_judge':
      return (
        <Message title='You’re not judging this event'>
          Ask an organizer to add you to the roster.
        </Message>
      );
    case 'disabled':
      return (
        <Message title='You’ve been paused'>
          An organizer has paused your judging for {view.eventName}. Your votes
          so far still count.
        </Message>
      );
    case 'not_open':
      return (
        <Message title={`${view.eventName} hasn’t started`}>
          Judging opens{' '}
          {view.opensAt ? (
            <LocalDateTime
              value={view.opensAt}
              dateStyle='medium'
              timeStyle='short'
              timeZoneName='short'
            />
          ) : (
            'once organizers schedule the event'
          )}
          . This page will update on its own.
        </Message>
      );
    case 'closed':
      return (
        <Message title='Judging is over'>
          {view.eventName} has ended. Thanks for judging!
        </Message>
      );
    case 'no_criteria':
      return (
        <Message title='Almost ready'>
          Organizers are still setting up the judging criteria for{' '}
          {view.eventName}. This page will update on its own.
        </Message>
      );
    case 'waiting':
      return (
        <Message title='Nothing to judge right now'>
          You&apos;ve seen every project available to you. Hang tight — more may
          open up as teams return to their tables.
        </Message>
      );
    case 'begin':
      return (
        <div className='flex flex-col gap-4'>
          <GoTo project={view.current} />
          <p className='text-muted-foreground text-sm'>
            Take a look at this first project. You won&apos;t vote on it yet —
            each project after this one is compared with the one before.
          </p>
          <Button
            size='lg'
            disabled={pending}
            onClick={() => run(() => beginJudging(eventId, view.current.id))}
          >
            {pending && <Spinner data-icon='inline-start' />}
            Begin
          </Button>
          <SkipPanel
            disabled={pending}
            onSkip={(reason) =>
              run(() =>
                skipJudgeProject(eventId, {
                  currentId: view.current.id,
                  reason,
                }),
              )
            }
          />
          <NoteEditor
            key={view.current.id}
            eventId={eventId}
            project={view.current}
          />
        </div>
      );
    case 'compare':
      return (
        <CompareScreen
          key={`${view.previous.id}:${view.current.id}`}
          eventId={eventId}
          view={view}
          pending={pending}
          run={run}
        />
      );
  }
}

function Message({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function GoTo({ project }: { project: JudgeProjectCard }) {
  return (
    <Card className='gap-1 p-5 text-center'>
      <p className='text-muted-foreground m-0 inline-flex items-center justify-center gap-1 text-sm'>
        <MapPin aria-hidden className='size-4' />
        Go to
      </p>
      <p className='m-0 text-4xl font-semibold tabular-nums'>
        Table {project.tableNumber}
      </p>
      <p className='m-0 text-lg'>{project.title}</p>
    </Card>
  );
}

function CompareScreen({
  eventId,
  view,
  pending,
  run,
}: {
  eventId: string;
  view: Extract<JudgeView, { kind: 'compare' }>;
  pending: boolean;
  run: (
    action: () => Promise<{
      success: boolean;
      error?: string;
      data?: JudgeView;
    }>,
  ) => Promise<void>;
}) {
  const [choices, setChoices] = React.useState<Record<string, Side>>({});
  const complete = view.criteria.every((c) => choices[c.id]);

  return (
    <div className='flex flex-col gap-4'>
      <GoTo project={view.current} />

      <div className='flex flex-col gap-3'>
        <p className='text-muted-foreground m-0 text-sm'>
          Once you&apos;ve seen it, pick the better project on each criterion.
        </p>
        {view.criteria.map((criterion) => (
          <fieldset
            key={criterion.id}
            className='rounded-xl border bg-white p-3'
          >
            <legend className='px-1 font-medium'>{criterion.name}</legend>
            {criterion.description && (
              <p className='text-muted-foreground mt-0 mb-2 text-sm'>
                {criterion.description}
              </p>
            )}
            <div className='grid grid-cols-2 gap-2'>
              {(['previous', 'current'] as const).map((side) => {
                const project =
                  side === 'previous' ? view.previous : view.current;
                const selected = choices[criterion.id] === side;
                return (
                  <button
                    key={side}
                    type='button'
                    aria-pressed={selected}
                    onClick={() =>
                      setChoices((prev) => ({ ...prev, [criterion.id]: side }))
                    }
                    className={cn(
                      'flex min-h-16 flex-col items-start rounded-lg border p-2 text-left text-sm transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-accent bg-background',
                    )}
                  >
                    <span className='text-xs font-medium uppercase opacity-80'>
                      {side === 'previous' ? 'Previous' : 'Current'} · Table{' '}
                      {project.tableNumber}
                    </span>
                    <span className='line-clamp-2 font-medium'>
                      {project.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <Button
        size='lg'
        disabled={pending || !complete}
        onClick={() =>
          run(() =>
            submitJudgeVote(eventId, {
              previousId: view.previous.id,
              currentId: view.current.id,
              winners: choices,
            }),
          )
        }
      >
        {pending && <Spinner data-icon='inline-start' />}
        Submit and go to next table
      </Button>

      <SkipPanel
        disabled={pending}
        onSkip={(reason) =>
          run(() =>
            skipJudgeProject(eventId, { currentId: view.current.id, reason }),
          )
        }
      />

      <NoteEditor eventId={eventId} project={view.current} />
      {view.previous.note && (
        <Card className='gap-1 p-4'>
          <p className='text-muted-foreground m-0 text-xs font-medium uppercase'>
            Your note on Table {view.previous.tableNumber}
          </p>
          <p className='m-0 text-sm whitespace-pre-wrap'>
            {view.previous.note}
          </p>
        </Card>
      )}
    </div>
  );
}

function SkipPanel({
  disabled,
  onSkip,
}: {
  disabled: boolean;
  onSkip: (reason: 'not_here' | 'conflict') => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return (
      <Button
        variant='ghost'
        className='self-center'
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Skip this project
      </Button>
    );
  }
  return (
    <Card className='gap-3 p-4'>
      <p className='m-0 font-medium'>Why are you skipping it?</p>
      <Button
        variant='outline'
        disabled={disabled}
        onClick={() => onSkip('not_here')}
      >
        Team not here
      </Button>
      <Button
        variant='outline'
        disabled={disabled}
        onClick={() => onSkip('conflict')}
      >
        Conflict of interest
      </Button>
      <p className='text-muted-foreground m-0 text-xs'>
        If the team isn&apos;t here you may be sent back later. A conflict of
        interest means you won&apos;t see this project again.
      </p>
      <Button
        variant='ghost'
        disabled={disabled}
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
    </Card>
  );
}

function NoteEditor({
  eventId,
  project,
}: {
  eventId: string;
  project: JudgeProjectCard;
}) {
  const [body, setBody] = React.useState(project.note);
  const [saved, setSaved] = React.useState(project.note);
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await saveJudgeNote(eventId, {
      submissionId: project.id,
      body,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSaved(body);
  }

  return (
    <Card className='gap-0 py-4'>
      <CardContent className='px-4'>
        <form onSubmit={save} className='flex flex-col gap-2'>
          <label htmlFor={`note-${project.id}`} className='text-sm font-medium'>
            Private note on Table {project.tableNumber}
          </label>
          <Textarea
            id={`note-${project.id}`}
            value={body}
            maxLength={JUDGE_NOTE_MAX_LENGTH}
            placeholder='Only you can see this.'
            aria-invalid={Boolean(error)}
            onChange={(e) => {
              setBody(e.target.value);
              setError(undefined);
            }}
          />
          {error && <FieldError>{error}</FieldError>}
          <Button
            type='submit'
            variant='outline'
            size='sm'
            className='self-end'
            disabled={saving || body === saved}
          >
            {saving && <Spinner data-icon='inline-start' />}
            {body === saved && saved ? 'Saved' : 'Save note'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
