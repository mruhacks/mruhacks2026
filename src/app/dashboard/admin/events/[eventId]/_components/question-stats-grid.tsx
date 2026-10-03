'use client';

import * as React from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { QuestionStats } from '@/lib/application-stats';
import { useStoredIdSet } from '@/lib/use-stored-id-set';

import { BarMeter } from './bar-meter';
import { BentoCard } from './bento-card';

/** One key per event, so hiding a question here doesn't hide it elsewhere. */
function storageKey(eventId: string) {
  return `event-stats-hidden:${eventId}`;
}

export function QuestionStatsGrid({
  eventId,
  questions,
}: {
  eventId: string;
  questions: QuestionStats[];
}) {
  const { ids: hidden, toggle, clear } = useStoredIdSet(storageKey(eventId));

  // `hidden` is null until the browser's value is known, and everything
  // renders until then — that keeps the hydration render identical to the
  // server's, which never sees localStorage. Storing the *hidden* ids (not
  // the visible ones) also means a question added later shows up by default
  // instead of silently staying off.
  const visible = hidden
    ? questions.filter((q) => !hidden.has(q.questionId))
    : questions;

  const hiddenCount = questions.length - visible.length;

  return (
    <section className='space-y-4'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2
            className='m-0'
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--fw-semibold)',
              fontSize: '24px',
              letterSpacing: 'var(--track-display)',
            }}
          >
            Application question breakdown
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            How applicants answered each question on the application form.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' size='sm'>
              <SlidersHorizontal aria-hidden className='size-4' />
              Choose stats
              {hiddenCount > 0 && (
                <span className='text-muted-foreground'>
                  ({visible.length}/{questions.length})
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            className='max-h-96 w-64 overflow-y-auto'
          >
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {questions.map((question) => (
              <DropdownMenuCheckboxItem
                key={question.questionId}
                checked={!hidden?.has(question.questionId)}
                // Radix closes the menu on select; keeping it open lets an
                // admin toggle several at once.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => toggle(question.questionId)}
              >
                <span className='truncate'>{question.label}</span>
              </DropdownMenuCheckboxItem>
            ))}
            {hiddenCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => clear()}>
                  Show all
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {visible.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          Every question is hidden. Use “Choose stats” to bring some back.
        </p>
      ) : (
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
          {visible.map((question) => (
            <BentoCard
              key={question.questionId}
              title={question.label}
              description={`${question.answered.toLocaleString()} ${
                question.answered === 1 ? 'response' : 'responses'
              }`}
            >
              {question.buckets.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  No responses yet.
                </p>
              ) : (
                <div className='space-y-2.5'>
                  {question.buckets.map((bucket) => (
                    <BarMeter
                      key={bucket.key}
                      label={bucket.label}
                      percent={bucket.percent}
                      inactive={bucket.inactive}
                    />
                  ))}
                </div>
              )}
            </BentoCard>
          ))}
        </div>
      )}
    </section>
  );
}
