'use client';

import * as React from 'react';
import { Check, PartyPopper, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  getApplicationReviewQueue,
  undoApplicationVote,
  voteOnApplication,
  type ReviewQueue,
} from '@/app/dashboard/admin/events/review-actions';
import { getAnswerDisplayValue } from '@/lib/application-answer-display';
import type { ReviewCard } from '@/lib/application-votes';
import { cn } from '@/lib/utils';

/** Horizontal drag, in px, past which releasing the card counts as a vote. */
const SWIPE_THRESHOLD = 120;
/** Refill from the server once this few cards are left in hand. */
const REFILL_AT = 3;
/** How many past votes the undo button can walk back through. */
const UNDO_DEPTH = 20;
/** Matches the fly-out transition below. */
const FLY_OUT_MS = 200;

type Decision = { card: ReviewCard; approve: boolean };

/**
 * The swipe stack. Votes apply optimistically — the card leaves at once — and
 * every server call (vote, undo, refill) runs through one serial chain, so an
 * undo can never overtake the vote it reverses and a refill never returns a
 * card whose vote is still in flight.
 */
export function ReviewDeck({
  eventId,
  initial,
}: {
  eventId: string;
  initial: ReviewQueue;
}) {
  const [cards, setCards] = React.useState(initial.cards);
  const [remaining, setRemaining] = React.useState(initial.remaining);
  const [reviewed, setReviewed] = React.useState(initial.reviewed);
  const [history, setHistory] = React.useState<Decision[]>([]);
  const [refilling, setRefilling] = React.useState(false);
  const [flying, setFlying] = React.useState<'yes' | 'no' | null>(null);
  const [dragX, setDragX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const dragStart = React.useRef<{ x: number; id: number } | null>(null);
  const chain = React.useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = React.useCallback((task: () => Promise<void>) => {
    chain.current = chain.current.then(task, task);
  }, []);

  const current = cards[0];
  const next = cards[1];

  // Ref, not state, so two votes in one tick can't both start a refill.
  const refillingRef = React.useRef(false);

  /**
   * Fetch more cards. Queued behind any in-flight votes, so the server has
   * already counted them; `held` (the cards still in hand) is skipped so a
   * refill never duplicates one.
   */
  const refill = React.useCallback(
    (held: ReviewCard[]) => {
      if (refillingRef.current) return;
      refillingRef.current = true;
      setRefilling(true);
      enqueue(async () => {
        const result = await getApplicationReviewQueue({
          eventId,
          skip: held.map((c) => c.participantId),
        });
        if (result.success && result.data) {
          const { cards: fresh, remaining: left, reviewed: done } = result.data;
          setCards((prev) => {
            const seen = new Set(prev.map((c) => c.participantId));
            return [
              ...prev,
              ...fresh.filter((c) => !seen.has(c.participantId)),
            ];
          });
          setRemaining(left);
          setReviewed(done);
        } else if (!result.success) {
          toast.error(result.error);
        }
        refillingRef.current = false;
        setRefilling(false);
      });
    },
    [eventId, enqueue],
  );

  const decide = React.useCallback(
    (approve: boolean) => {
      if (!current || flying) return;
      const card = current;
      setFlying(approve ? 'yes' : 'no');
      setDragging(false);
      setHistory((prev) => [{ card, approve }, ...prev].slice(0, UNDO_DEPTH));
      setRemaining((n) => Math.max(0, n - 1));
      setReviewed((n) => n + 1);
      window.setTimeout(() => {
        setCards((prev) => prev.filter((c) => c !== card));
        setFlying(null);
        setDragX(0);
      }, FLY_OUT_MS);

      enqueue(async () => {
        const result = await voteOnApplication({
          eventId,
          participantId: card.participantId,
          approve,
        });
        if (!result.success) {
          toast.error(result.error);
          // The vote didn't land: forget it so undo doesn't try to reverse it.
          setHistory((prev) => prev.filter((d) => d.card !== card));
          setReviewed((n) => Math.max(0, n - 1));
        }
      });

      // Top the hand up while the server still has unseen applications.
      const left = cards.filter((c) => c !== card);
      if (left.length <= REFILL_AT && remaining - 1 > left.length) refill(left);
    },
    [current, cards, remaining, flying, eventId, enqueue, refill],
  );

  const undo = React.useCallback(() => {
    const [last, ...rest] = history;
    if (!last || flying) return;
    setHistory(rest);
    setCards((prev) => [last.card, ...prev]);
    setRemaining((n) => n + 1);
    setReviewed((n) => Math.max(0, n - 1));

    enqueue(async () => {
      const result = await undoApplicationVote({
        eventId,
        participantId: last.card.participantId,
      });
      if (!result.success) {
        toast.error(result.error);
        // The vote stands (e.g. they were invited meanwhile): drop the card.
        setCards((prev) => prev.filter((c) => c !== last.card));
        setRemaining((n) => Math.max(0, n - 1));
        setReviewed((n) => n + 1);
      }
    });
  }, [history, flying, eventId, enqueue]);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowRight') decide(true);
      else if (event.key === 'ArrowLeft') decide(false);
      else if (event.key === 'z' || event.key === 'Backspace') undo();
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, undo]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (flying || event.button !== 0) return;
    dragStart.current = { x: event.clientX, id: event.pointerId };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    // Capture only once it's clearly a horizontal drag, so text inside the
    // card stays selectable and vertical scrolling stays native.
    if (Math.abs(dx) > 8 && !event.currentTarget.hasPointerCapture(start.id)) {
      event.currentTarget.setPointerCapture(start.id);
    }
    setDragX(dx);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start || start.id !== event.pointerId) return;
    dragStart.current = null;
    setDragging(false);
    if (Math.abs(dragX) >= SWIPE_THRESHOLD) decide(dragX > 0);
    else setDragX(0);
  }

  const offset = flying === 'yes' ? 600 : flying === 'no' ? -600 : dragX;
  const lean = Math.max(-1, Math.min(1, offset / SWIPE_THRESHOLD));

  return (
    <div className='mx-auto flex max-w-xl flex-col gap-4'>
      <p className='text-muted-foreground text-center text-sm tabular-nums'>
        <strong className='text-foreground'>{reviewed.toLocaleString()}</strong>{' '}
        reviewed ·{' '}
        <strong className='text-foreground'>
          {remaining.toLocaleString()}
        </strong>{' '}
        left
      </p>

      <div className='relative h-112 sm:h-128'>
        {next && (
          <ApplicationCard
            card={next}
            aria-hidden
            className='pointer-events-none absolute inset-0 scale-[0.96] opacity-60'
          />
        )}

        {current ? (
          <div
            key={current.participantId}
            className={cn(
              'absolute inset-0 touch-pan-y select-none',
              !dragging && 'transition-transform duration-200 ease-out',
            )}
            style={{
              transform: `translateX(${offset}px) rotate(${offset / 25}deg)`,
              opacity: flying ? 0 : 1,
              transitionProperty: dragging ? 'none' : 'transform, opacity',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <ApplicationCard card={current} />
            <Stamp kind='yes' visible={Math.max(0, lean)} />
            <Stamp kind='no' visible={Math.max(0, -lean)} />
          </div>
        ) : refilling ? (
          <div className='bg-muted absolute inset-0 animate-pulse rounded-xl' />
        ) : (
          <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center'>
            <PartyPopper aria-hidden className='text-muted-foreground size-8' />
            <p className='m-0 font-semibold'>You&apos;re all caught up</p>
            <p className='text-muted-foreground m-0 text-sm'>
              You&apos;ve voted on every application still in review. New ones
              will show up here as they come in.
            </p>
          </div>
        )}
      </div>

      <div className='flex items-center justify-center gap-4'>
        <Button
          variant='outline'
          size='icon-lg'
          className='size-14 border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600'
          onClick={() => decide(false)}
          disabled={!current || !!flying}
          aria-label='No'
          title='No (←)'
        >
          <X className='size-6' />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          onClick={undo}
          disabled={history.length === 0 || !!flying}
          aria-label='Undo last vote'
          title='Undo (Z)'
        >
          <Undo2 />
        </Button>
        <Button
          variant='outline'
          size='icon-lg'
          className='size-14 border-emerald-600/40 text-emerald-600 hover:bg-emerald-600/10 hover:text-emerald-600'
          onClick={() => decide(true)}
          disabled={!current || !!flying}
          aria-label='Yes'
          title='Yes (→)'
        >
          <Check className='size-6' />
        </Button>
      </div>
      <p className='text-muted-foreground m-0 text-center text-xs'>
        Swipe or use ← / → to vote, Z to undo.
      </p>
    </div>
  );
}

function ApplicationCard({
  card,
  className,
  ...props
}: {
  card: ReviewCard;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card
      className={cn('h-full gap-0 overflow-y-auto p-6 shadow-md', className)}
      {...props}
    >
      <dl className='m-0 space-y-5'>
        {card.answers.map((answer) => (
          <div key={answer.questionId}>
            <dt className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {answer.label}
            </dt>
            <dd className='m-0 mt-1 text-sm/relaxed wrap-break-word whitespace-pre-wrap'>
              {getAnswerDisplayValue(
                answer.value,
                answer.type,
                answer.options,
                answer.otherText,
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Stamp({ kind, visible }: { kind: 'yes' | 'no'; visible: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-6 rounded-md border-4 px-3 py-1 text-2xl font-black tracking-widest uppercase',
        kind === 'yes'
          ? 'left-6 -rotate-12 border-emerald-600 text-emerald-600'
          : 'right-6 rotate-12 border-red-600 text-red-600',
      )}
      style={{ opacity: visible }}
    >
      {kind}
    </span>
  );
}
