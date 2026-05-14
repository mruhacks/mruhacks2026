'use client';

import * as React from 'react';
import { ChevronUp, ChevronDown, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ApplicationQuestion } from '@/types/application';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  short_text: 'Short Text',
  long_text: 'Long Text',
  single_select: 'Single Select',
  multi_select: 'Multi Select',
  number: 'Number',
  boolean: 'Checkbox',
};

type QuestionCardProps = {
  question: ApplicationQuestion;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onReactivate?: () => void;
  isDragging?: boolean;
};

export function QuestionCard({
  question: q,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onReactivate,
  isDragging,
}: QuestionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: q.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={q.active ? '' : 'opacity-50'}
    >
      <CardContent className='flex items-start gap-4 py-4'>
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className='cursor-grab active:cursor-grabbing pt-0.5'
          aria-label='Drag to reorder'
        >
          <GripVertical className='size-4 text-muted-foreground' />
        </button>

        {/* Content */}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='font-medium text-sm'>{q.label}</span>
            {q.required && (
              <span className='text-destructive text-xs'>Required</span>
            )}
            {!q.active && (
              <span className='text-muted-foreground rounded bg-muted px-1.5 py-0.5 text-xs'>
                Hidden
              </span>
            )}
            <span className='rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
              {TYPE_LABELS[q.type] ?? q.type}
            </span>
          </div>

          {q.description && (
            <p className='text-muted-foreground mt-0.5 text-xs'>{q.description}</p>
          )}

          {q.options && q.options.length > 0 && (
            <ul className='mt-1.5 space-y-0.5'>
              {q.options.map((opt) => (
                <li
                  key={opt.value}
                  className={`text-xs ${opt.active ? '' : 'text-muted-foreground line-through'}`}
                >
                  • {opt.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className='flex gap-1 shrink-0'>
          {!q.active && onReactivate && (
            <Button
              variant='ghost'
              size='icon'
              className='size-8 text-muted-foreground hover:text-foreground'
              onClick={onReactivate}
              aria-label='Reactivate'
            >
              <Eye className='size-4' />
            </Button>
          )}
          {q.active && (
            <>
              <Button variant='ghost' size='icon' className='size-8' onClick={onEdit} aria-label='Edit'>
                <Pencil className='size-4' />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                className='size-8 text-destructive hover:text-destructive'
                onClick={onDelete}
                aria-label='Delete'
              >
                <Trash2 className='size-4' />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
