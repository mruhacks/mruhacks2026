import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, CircleHelp, MapPin, X } from 'lucide-react';

import {
  beginJudging,
  skipJudgeProject,
  submitJudgeVote,
} from '@/app/dashboard/events/judge-actions';
import curtWriting from '@/assets/crt_writing.png';
import { LocalDateTime } from '@/components/local-date-time';
import { Button } from '@/components/ui/button';
import {
  getJudgeView,
  type JudgeProjectCard,
  type JudgeView,
} from '@/lib/judging/judge-session';
import { cn } from '@/lib/utils';

import {
  ActionForm,
  AutoRefresh,
  NotesButton,
  SkipButton,
  SubmitButton,
} from '../judge-controls';
import { JudgeCard, JudgeFrame, loadJudgeEvent } from '../judge-frame';
import { BIG, GO } from '../judge-styles';

type Props = { params: Promise<{ eventId: string }> };

/** Session and DB reads stream in behind Suspense — see the event page. */
export const instant = false;

/**
 * The judge's screen during the expo: wherever the server has sent them.
 * Rendering assigns a project when they have none, and every action
 * refreshes this page, so there's no client-side state to keep in step.
 */
export default function JudgeTablePage({ params }: Props) {
  return (
    <Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <JudgeTable paramsPromise={params} />
    </Suspense>
  );
}

async function JudgeTable({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const event = await loadJudgeEvent(segment);
  const view = await getJudgeView(event.id);

  return (
    <JudgeFrame segment={segment} eventName={event.name}>
      <Screen
        eventId={event.id}
        view={view}
        help={
          <Button
            asChild
            variant='ghost'
            size='icon-sm'
            className='text-muted-foreground'
          >
            <Link
              href={`/dashboard/events/${segment}/judge`}
              aria-label='How judging works'
            >
              <CircleHelp className='size-5' />
            </Link>
          </Button>
        }
      />
    </JudgeFrame>
  );
}

/** `help` only shows on screens where how judging works is still relevant. */
function Screen({
  eventId,
  view,
  help,
}: {
  eventId: string;
  view: JudgeView;
  help: React.ReactNode;
}) {
  const skip = skipJudgeProject.bind(null, eventId);

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
        <Message title={`${view.eventName} hasn’t started`} poll help={help}>
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
        <Message title='Almost ready' poll help={help}>
          Organizers are still setting up the judging criteria for{' '}
          {view.eventName}. This page will update on its own.
        </Message>
      );
    case 'waiting':
      return (
        <Message title='Nothing to judge right now' poll help={help}>
          You&apos;ve seen every project available to you. Hang tight, more may
          open up as teams return to their tables.
        </Message>
      );
    case 'begin':
      return (
        <JudgeCard help={help}>
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
          <Image
            src={curtWriting}
            alt='Curt the CRT, taking notes'
            className='mx-auto h-auto w-52'
            priority
          />
          <div className='flex flex-col gap-1 text-center'>
            <p className='m-0 font-semibold'>Listen and learn</p>
            <p className='text-muted-foreground m-0 text-sm'>
              Get to know this team and their project. No need to think about
              rankings just yet, you&apos;ll start comparing at your next table.
            </p>
          </div>
          <ActionForm
            key={view.current.id}
            action={beginJudging.bind(null, eventId)}
          >
            <input type='hidden' name='currentId' value={view.current.id} />
            <ActionBar
              skip={<SkipButton action={skip} currentId={view.current.id} />}
            >
              <SubmitButton className={cn(BIG, GO)} icon={<Check />}>
                Begin
              </SubmitButton>
            </ActionBar>
          </ActionForm>
        </JudgeCard>
      );
    case 'compare':
      return (
        <CompareScreen eventId={eventId} view={view} skip={skip} help={help} />
      );
  }
}

function Message({
  title,
  poll,
  help,
  children,
}: {
  title: string;
  /** Nothing to do yet: check back on a timer. */
  poll?: boolean;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <JudgeCard className='items-center py-8 text-center' help={help}>
      {poll && <AutoRefresh />}
      <h1 className='m-0 text-2xl font-semibold tracking-tight sm:text-3xl'>
        {title}
      </h1>
      <p className='text-muted-foreground m-0 max-w-md'>{children}</p>
    </JudgeCard>
  );
}

function GoTo({
  project,
  notes,
}: {
  project: JudgeProjectCard;
  notes: React.ReactNode;
}) {
  return (
    <div className='relative flex flex-col items-center gap-0.5 text-center'>
      <div className='absolute -top-1 -right-2'>{notes}</div>
      <p className='text-muted-foreground m-0 inline-flex items-center gap-1 text-xs font-semibold tracking-wider uppercase'>
        <MapPin aria-hidden className='size-4' />
        Go to
      </p>
      <p className='m-0 text-4xl/tight font-bold tabular-nums'>
        Table {project.tableLabel}
      </p>
      <p className='m-0 line-clamp-1 max-w-full px-16 font-medium'>
        <em>{project.title}</em>
      </p>
    </div>
  );
}

const SIDES = ['previous', 'current'] as const;

/**
 * One radio group per criterion, styled as two big buttons. They're all
 * `required`, so the form is `:invalid` — and the next button reads "Pick
 * one for each" — until every criterion has a pick.
 */
function CompareScreen({
  eventId,
  view,
  skip,
  help,
}: {
  eventId: string;
  view: Extract<JudgeView, { kind: 'compare' }>;
  skip: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
  help: React.ReactNode;
}) {
  return (
    <JudgeCard help={help}>
      <ActionForm
        // A new pair is a fresh form, so no pick carries over to it.
        key={`${view.previous.id}:${view.current.id}`}
        action={submitJudgeVote.bind(null, eventId)}
        className='group/vote flex flex-col gap-3'
      >
        <input type='hidden' name='previousId' value={view.previous.id} />
        <input type='hidden' name='currentId' value={view.current.id} />
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
          {SIDES.map((side) => {
            const project = side === 'previous' ? view.previous : view.current;
            return (
              <div key={side} className='min-w-0 text-center'>
                <p className='text-muted-foreground m-0 text-xs font-semibold tracking-wider uppercase'>
                  {side === 'previous' ? 'Previous' : 'Current'}
                </p>
                <p className='m-0 truncate text-sm font-medium'>
                  Table {project.tableLabel} · <em>{project.title}</em>
                </p>
              </div>
            );
          })}
          {view.criteria.map((criterion) => (
            <div
              key={criterion.id}
              role='radiogroup'
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
              {SIDES.map((side) => (
                <label
                  key={side}
                  className={cn(
                    'group/pick inline-flex h-12 cursor-pointer items-center justify-center gap-1 rounded-xl border-2 bg-white text-base font-bold transition-colors hover:bg-(--ink-050)',
                    'has-focus-visible:ring-4 has-disabled:cursor-default has-disabled:opacity-60',
                    // Picking Previous reads as "the current one lost": blue
                    // with an X. Picking Current is green with a check.
                    side === 'previous'
                      ? 'has-checked:border-blue-600 has-checked:bg-blue-600 has-checked:text-white'
                      : 'has-checked:border-green-600 has-checked:bg-green-600 has-checked:text-white',
                  )}
                >
                  <input
                    type='radio'
                    name={`winner:${criterion.id}`}
                    value={side}
                    required
                    className='sr-only'
                  />
                  {side === 'previous' ? (
                    <X
                      aria-hidden
                      className='hidden size-5 group-has-checked/pick:block'
                    />
                  ) : (
                    <Check
                      aria-hidden
                      className='hidden size-5 group-has-checked/pick:block'
                    />
                  )}
                  {side === 'previous' ? 'Previous' : 'Current'}
                </label>
              ))}
            </div>
          ))}
        </div>

        <ActionBar
          skip={<SkipButton action={skip} currentId={view.current.id} />}
        >
          <SubmitButton
            className={cn(
              BIG,
              GO,
              'group-invalid/vote:pointer-events-none group-invalid/vote:opacity-50',
            )}
            iconEnd={
              <ArrowRight className='group-invalid/vote:hidden' aria-hidden />
            }
          >
            <span className='group-invalid/vote:hidden'>Next table</span>
            <span className='hidden group-invalid/vote:inline'>
              Pick one for each
            </span>
          </SubmitButton>
        </ActionBar>
      </ActionForm>
    </JudgeCard>
  );
}

/** Skip on the left, the screen's green go button on the right. */
function ActionBar({
  skip,
  children,
}: {
  skip: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className='mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3'>
      {skip}
      {children}
    </div>
  );
}
