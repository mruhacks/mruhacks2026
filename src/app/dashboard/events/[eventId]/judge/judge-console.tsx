'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  ExternalLink,
  MapPin,
  MessageCircleQuestion,
  NotebookPen,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  beginJudging,
  getJudgeView,
  saveJudgeNote,
  skipJudgeProject,
  submitJudgeVote,
  type JudgeProjectCard,
  type JudgeView,
} from '@/app/dashboard/events/judge-actions';
import curtLecturing from '@/assets/crt_lecturing.png';
import { LocalDateTime } from '@/components/local-date-time';
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
import { cn } from '@/lib/utils';

/** While there's nothing to do yet, check back this often. */
const IDLE_POLL_MS = 30_000;

type Side = 'previous' | 'current';

type RunAction = (
  action: () => Promise<{
    success: boolean;
    error?: string;
    data?: JudgeView;
  }>,
) => Promise<void>;

/**
 * Judges use this one-handed, mid-conversation, on a crowded expo floor, so
 * the controls are big and colour-coded: green moves you forward, grey skips.
 * Kept compact enough that a phone shows the whole screen, next button
 * included, without scrolling.
 */
const SCREEN = 'mx-auto flex w-full max-w-2xl flex-col gap-3';
const GO =
  'bg-green-600 text-white shadow-md hover:bg-green-700 focus-visible:ring-green-600/40';
const SKIP = 'bg-(--ink-200) text-(--black) shadow-sm hover:bg-(--ink-300)';
const BIG = 'h-14 rounded-xl text-lg font-bold [&_svg]:size-5';

/**
 * The judge's screen. Holds only the current `JudgeView`: every action
 * returns the next one, so the server alone decides where the judge goes.
 */
export function JudgeConsole({
  eventId,
  backHref,
}: {
  eventId: string;
  backHref: string;
}) {
  const [view, setView] = React.useState<JudgeView | null>(null);
  const [pending, setPending] = React.useState(false);
  /** Shown every time judging opens, and again from the help button. */
  const [showIntro, setShowIntro] = React.useState(true);

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
  const run: RunAction = async (action) => {
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
  };

  // Nothing to explain to someone who can't judge right now.
  const explainable =
    view?.kind !== 'not_judge' &&
    view?.kind !== 'disabled' &&
    view?.kind !== 'closed';

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between'>
        {/* The header's breadcrumbs are hidden on phones, so this is the way
            back out there. */}
        <Button
          asChild
          variant='ghost'
          size='sm'
          className='text-muted-foreground -ml-2 w-fit'
        >
          <Link href={backHref}>
            <ArrowLeft data-icon='inline-start' />
            Back to event
          </Link>
        </Button>
        {explainable && !showIntro && (
          <Button
            variant='ghost'
            size='icon'
            aria-label='How judging works'
            className='text-muted-foreground -mr-2'
            onClick={() => setShowIntro(true)}
          >
            <CircleHelp className='size-5' />
          </Button>
        )}
      </div>
      {explainable && showIntro && <Intro onDone={() => setShowIntro(false)} />}
      {/* Hidden rather than unmounted under the explainer, so reopening it
          mid-comparison keeps the picks already made. */}
      <div hidden={explainable && showIntro}>{renderScreen()}</div>
    </div>
  );

  function renderScreen() {
    if (!view) {
      return (
        <div className={cn(SCREEN, 'items-center py-16')}>
          <Spinner className='size-8' />
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
            An organizer has paused your judging for {view.eventName}. Your
            votes so far still count.
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
            You&apos;ve seen every project available to you. Hang tight — more
            may open up as teams return to their tables.
          </Message>
        );
      case 'begin':
        return (
          <div className={SCREEN}>
            <GoTo
              project={view.current}
              notes={
                <NotesButton
                  key={view.current.id}
                  eventId={eventId}
                  project={view.current}
                />
              }
            />
            <p className='text-muted-foreground m-0 text-center text-sm'>
              Take a look at this first project. You won&apos;t vote on it —
              each project after this one is compared with the one before.
            </p>
            <ActionBar
              pending={pending}
              onSkip={(reason) =>
                run(() =>
                  skipJudgeProject(eventId, {
                    currentId: view.current.id,
                    reason,
                  }),
                )
              }
            >
              <Button
                className={cn(BIG, GO)}
                disabled={pending}
                onClick={() =>
                  run(() => beginJudging(eventId, view.current.id))
                }
              >
                {pending ? <Spinner /> : <Check />}
                Begin
              </Button>
            </ActionBar>
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
}

/**
 * What a judge reads each time they open judging: what they'll actually do
 * at each table, and where to turn with questions. Kept to one phone screen
 * so it gets read on the expo floor rather than skipped.
 */
function Intro({ onDone }: { onDone: () => void }) {
  return (
    <div className={SCREEN}>
      <div className='flex flex-col gap-3 rounded-xl border bg-white px-5 py-4 shadow-sm'>
        <h1 className='m-0 text-3xl font-semibold tracking-tight'>
          How MRUHacks does judging
        </h1>
        <Image
          src={curtLecturing}
          alt='Curt the CRT, pointing at the explanation'
          className='mx-auto h-auto w-36'
          priority
        />
        <ol className='m-0 flex list-decimal flex-col gap-1.5 pl-5'>
          <li>
            We&apos;ll send you to a specific table. Talk to the team there and
            get to know them and their project.
          </li>
          <li>
            When you&apos;re done, we&apos;ll send you to the next table. The
            first project is just a starting point; we&apos;ll ask you to
            compare once you&apos;ve seen the next team as well.
          </li>
          <li>
            From then on, after each table we&apos;ll ask you which was better
            for each criterion: this project or the one before. No 1–10 scores.
          </li>
        </ol>
        <div className='flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-900'>
          <MessageCircleQuestion
            aria-hidden
            className='mt-0.5 size-4 shrink-0'
          />
          <p className='m-0'>If you have any questions, please ask us!</p>
        </div>
        <p className='text-muted-foreground m-0 text-sm'>
          Rankings use the Crowd-BT model from{' '}
          <a
            href='http://people.stern.nyu.edu/xchen3/images/crowd_pairwise.pdf'
            target='_blank'
            rel='noreferrer'
            className='inline-flex items-center gap-0.5 underline underline-offset-2'
          >
            Chen et al., 2013
            <ExternalLink aria-hidden className='size-3' />
          </a>
          .
        </p>

        <Button className={cn(BIG, GO, 'mt-3')} onClick={onDone}>
          Get on with it!
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function Message({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(SCREEN, 'items-center py-12 text-center')}>
      <h1 className='m-0 text-2xl font-semibold tracking-tight sm:text-3xl'>
        {title}
      </h1>
      <p className='text-muted-foreground m-0 max-w-md'>{children}</p>
    </div>
  );
}

function GoTo({
  project,
  className,
  notes,
}: {
  project: JudgeProjectCard;
  className?: string;
  notes: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-0.5 rounded-xl border bg-white px-4 py-3 text-center shadow-sm',
        className,
      )}
    >
      <div className='absolute top-2 right-2'>{notes}</div>
      <p className='text-muted-foreground m-0 inline-flex items-center gap-1 text-xs font-semibold tracking-wider uppercase'>
        <MapPin aria-hidden className='size-4' />
        Go to
      </p>
      <p className='m-0 text-4xl/tight font-bold tabular-nums'>
        Table {project.tableNumber}
      </p>
      <p className='m-0 line-clamp-1 max-w-full px-16 font-medium'>
        <em>{project.title}</em>
      </p>
    </div>
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
  run: RunAction;
}) {
  const [choices, setChoices] = React.useState<Record<string, Side>>({});
  const complete = view.criteria.every((c) => choices[c.id]);

  return (
    <div className={SCREEN}>
      <GoTo
        project={view.current}
        notes={
          <NotesButton
            eventId={eventId}
            project={view.current}
            previous={view.previous}
          />
        }
      />

      {/* One grid for the whole comparison: the two projects head the
          columns, and each criterion is a label row over its two buttons,
          so every button lines up under the project it picks. */}
      <div className='grid grid-cols-2 gap-x-2 gap-y-1.5'>
        {(['previous', 'current'] as const).map((side) => {
          const project = side === 'previous' ? view.previous : view.current;
          return (
            <div key={side} className='min-w-0 text-center'>
              <p className='text-muted-foreground m-0 text-xs font-semibold tracking-wider uppercase'>
                {side === 'previous' ? 'Previous' : 'Current'}
              </p>
              <p className='m-0 truncate text-sm font-medium'>
                Table {project.tableNumber} · <em>{project.title}</em>
              </p>
            </div>
          );
        })}
        {view.criteria.map((criterion) => {
          const choice = choices[criterion.id];
          return (
            <div
              key={criterion.id}
              role='group'
              aria-labelledby={`criterion-${criterion.id}`}
              className='contents'
            >
              <p
                id={`criterion-${criterion.id}`}
                className='col-span-2 m-0 mt-1.5 truncate text-sm font-semibold'
              >
                {criterion.name}
                {criterion.description && (
                  <span className='text-muted-foreground ml-2 font-normal'>
                    {criterion.description}
                  </span>
                )}
              </p>
              {(['previous', 'current'] as const).map((side) => {
                const won = choice === side;
                return (
                  <button
                    key={side}
                    type='button'
                    aria-pressed={won}
                    disabled={pending}
                    onClick={() =>
                      setChoices((prev) => ({ ...prev, [criterion.id]: side }))
                    }
                    className={cn(
                      'inline-flex h-12 cursor-pointer items-center justify-center gap-1 rounded-xl border-2 text-base font-bold transition-colors outline-none focus-visible:ring-4 disabled:opacity-60',
                      // Picking Previous reads as "the current one lost":
                      // red with an X. Picking Current is green with a check.
                      won &&
                        side === 'previous' &&
                        'border-blue-600 bg-blue-600 text-white',
                      won &&
                        side === 'current' &&
                        'border-green-600 bg-green-600 text-white',
                      !won && 'bg-white hover:bg-(--ink-050)',
                    )}
                  >
                    {won &&
                      (side === 'previous' ? (
                        <X aria-hidden className='size-5' />
                      ) : (
                        <Check aria-hidden className='size-5' />
                      ))}
                    {side === 'previous' ? 'Previous' : 'Current'}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <ActionBar
        pending={pending}
        onSkip={(reason) =>
          run(() =>
            skipJudgeProject(eventId, { currentId: view.current.id, reason }),
          )
        }
      >
        <Button
          className={cn(BIG, GO)}
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
          {pending && <Spinner />}
          {complete ? 'Next table' : 'Pick one for each'}
          {!pending && complete && <ArrowRight />}
        </Button>
      </ActionBar>
    </div>
  );
}

/** Skip on the left, the screen's green go button on the right. */
function ActionBar({
  pending,
  onSkip,
  children,
}: {
  pending: boolean;
  onSkip: (reason: 'not_here' | 'conflict') => void;
  children: React.ReactNode;
}) {
  return (
    <div className='mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3'>
      <SkipButton disabled={pending} onSkip={onSkip} />
      {children}
    </div>
  );
}

function SkipButton({
  disabled,
  onSkip,
}: {
  disabled: boolean;
  onSkip: (reason: 'not_here' | 'conflict') => void;
}) {
  const [open, setOpen] = React.useState(false);
  const choose = (reason: 'not_here' | 'conflict') => {
    setOpen(false);
    onSkip(reason);
  };
  return (
    <>
      <Button
        className={cn(BIG, SKIP)}
        disabled={disabled}
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
          <Button className={cn(BIG, SKIP)} onClick={() => choose('not_here')}>
            Team not here
          </Button>
          <Button className={cn(BIG, SKIP)} onClick={() => choose('conflict')}>
            Conflict of interest
          </Button>
          <Button variant='ghost' size='lg' onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Notes live behind a button so the voting controls keep the screen. The
 * saved text is held here rather than in the dialog, which unmounts on close.
 */
function NotesButton({
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
      <Button variant='ghost' size='sm' onClick={() => setOpen(true)}>
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
                Your note on Table {previous.tableNumber}
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
    const result = await saveJudgeNote(eventId, {
      submissionId: project.id,
      body,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved(body);
  }

  return (
    <form onSubmit={save} className='flex flex-col gap-2'>
      <label htmlFor={`note-${project.id}`} className='text-sm font-medium'>
        Table {project.tableNumber} · <em>{project.title}</em>
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
