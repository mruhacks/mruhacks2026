'use client';

import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';

import { reorderEventArticles } from '@/app/dashboard/admin/events/content-actions';
import { Button } from '@/components/ui/button';
import { WikiArticleRow, type WikiArticleRowData } from './wiki-article-row';

type Props = {
  eventId: string;
  articles: WikiArticleRowData[];
  canWrite: boolean;
};

export function WikiArticleList({ eventId, articles, canWrite }: Props) {
  const isMounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // Revalidation supplies the authoritative list; failed saves automatically
  // roll back when the transition ends, and other mutations stay in sync.
  const [orderedArticles, setOptimisticArticles] =
    React.useOptimistic(articles);
  const [isPending, startTransition] = React.useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!canWrite || isPending || !over || active.id === over.id) return;
    const oldIndex = orderedArticles.findIndex(
      (article) => article.id === active.id,
    );
    const newIndex = orderedArticles.findIndex(
      (article) => article.id === over.id,
    );
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(orderedArticles, oldIndex, newIndex);
    startTransition(async () => {
      setOptimisticArticles(reordered);
      try {
        const result = await reorderEventArticles(
          eventId,
          reordered.map((article) => article.id),
        );
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success('Articles reordered.');
      } catch {
        toast.error('Unable to reorder articles. Please try again.');
      }
    });
  }

  if (!isMounted || !canWrite) {
    return (
      <ul className='m-0 list-none divide-y p-0'>
        {articles.map((article) => (
          <li key={article.id}>
            <WikiArticleRow
              eventId={eventId}
              article={article}
              canWrite={canWrite}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={orderedArticles.map((article) => article.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className='m-0 list-none divide-y p-0' aria-busy={isPending}>
          {orderedArticles.map((article) => (
            <SortableArticle
              key={article.id}
              eventId={eventId}
              article={article}
              disabled={isPending}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableArticle({
  eventId,
  article,
  disabled,
}: {
  eventId: string;
  article: WikiArticleRowData;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <WikiArticleRow
        eventId={eventId}
        article={article}
        canWrite
        disabled={disabled}
        dragHandle={
          <Button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type='button'
            variant='ghost'
            size='icon-sm'
            className='relative order-first shrink-0 cursor-grab touch-none active:cursor-grabbing'
            disabled={disabled}
            aria-label={`Drag to reorder ${article.title}`}
          >
            <GripVertical data-icon='inline-start' />
          </Button>
        }
      />
    </li>
  );
}
