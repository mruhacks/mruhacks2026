'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { currentScheduleEntryId, type ScheduleInstant } from '@/lib/schedule';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

export function ScheduleViewport({
  entries,
  children,
  fitContainer = false,
}: {
  entries: ScheduleInstant[];
  children: ReactNode;
  fitContainer?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ above: false, below: false });
  const updateEdges = useCallback(() => {
    const container = viewport.current;
    if (!container) return;
    const above = container.scrollTop > 1;
    const below =
      container.scrollTop + container.clientHeight < container.scrollHeight - 1;
    setEdges((previous) =>
      previous.above === above && previous.below === below
        ? previous
        : { above, below },
    );
  }, []);
  const now = useNow(60_000);
  const currentId = now === null ? null : currentScheduleEntryId(entries, now);

  useEffect(() => {
    const container = viewport.current;
    const contents = content.current;
    if (!container || !contents) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(container);
    observer.observe(contents);
    return () => observer.disconnect();
  }, [updateEdges]);

  useEffect(() => {
    const container = viewport.current;
    if (!container || !currentId) return;
    const entry = Array.from(
      container.querySelectorAll<HTMLElement>('[data-schedule-entry]'),
    ).find((element) => element.dataset.scheduleEntry === currentId);
    if (entry) {
      // Scroll this panel only; never move the page away from its header.
      const dayHeading = entry.closest('section')?.querySelector('h3');
      container.scrollTop +=
        entry.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        (dayHeading?.getBoundingClientRect().height ?? 0);
    }
  }, [currentId]);

  return (
    <div
      className={cn(
        'flex max-h-96 min-w-0 flex-col',
        fitContainer && 'lg:max-h-none lg:min-h-0 lg:flex-1',
      )}
    >
      <div className='relative flex min-h-0 flex-1 flex-col'>
        <div
          ref={viewport}
          role='region'
          aria-label='Schedule'
          tabIndex={0}
          onScroll={updateEdges}
          className='min-h-0 overflow-y-auto overscroll-contain'
        >
          <div ref={content}>{children}</div>
        </div>
        {edges.above && (
          <div
            aria-hidden
            className='from-card pointer-events-none absolute inset-x-0 top-0 h-4 bg-linear-to-b to-transparent'
          />
        )}
      </div>
    </div>
  );
}
