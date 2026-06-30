'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { Button } from '@/components/ui/button';
import type { ApplicationQuestion } from '@/types/application';
import { QuestionCard } from './question-card';
import { QuestionDialog } from './question-dialog';
import { DeleteQuestionDialog } from './delete-question-dialog';
import {
  addQuestion,
  editQuestion,
  removeQuestion,
  reorderQuestions,
  reactivateQuestion,
} from '@/app/dashboard/admin/events/actions';
import type { AddQuestionInput, EditQuestionInput } from '@/app/dashboard/admin/events/schemas';

type QuestionBuilderProps = {
  eventId: string;
  initialQuestions: ApplicationQuestion[];
  hasApplications: boolean;
};

export function QuestionBuilder({
  eventId,
  initialQuestions,
  hasApplications,
}: QuestionBuilderProps) {
  // TODO: Disable edit/delete buttons if current user lacks event-specific 'event:manage' permission
  // TODO: Show read-only view if user has 'event:read' but not 'event:manage' for this event
  const [isMounted, setIsMounted] = React.useState(false);
  const [questions, setQuestions] = React.useState(
    [...initialQuestions].sort((a, b) => a.order - b.order),
  );

  const [addOpen, setAddOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ApplicationQuestion | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ApplicationQuestion | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
  );

  // ── Add ─────────────────────────────────────────────────────────────────
  const handleAdd = async (data: AddQuestionInput & { options: { label: string; value?: string; active: boolean }[] }) => {
    const result = await addQuestion(eventId, {
      label: data.label,
      type: data.type,
      description: data.description,
      required: data.required,
      options: data.options?.filter((o) => o.label).map((o) => ({ label: o.label })),
    });
    if (result.success && result.data) {
      toast.success('Question added.');
      setAddOpen(false);
      // Use the question returned from the backend with its UUIDs
      setQuestions([...questions, result.data]);
    } else if (!result.success) {
      toast.error(result.error);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const handleEdit = async (
    data: EditQuestionInput & { options: { label: string; value?: string; active: boolean }[] },
  ) => {
    if (!editTarget) return;
    const result = await editQuestion(eventId, editTarget.id, {
      label: data.label,
      description: data.description,
      required: data.required,
      options: data.options,
    });
    if (result.success) {
      toast.success('Question updated.');
      setEditTarget(null);
      // Update local state optimistically
      setQuestions(
        questions.map((q) =>
          q.id === editTarget.id
            ? {
                ...q,
                label: data.label ?? q.label,
                description: data.description ?? q.description,
                required: data.required ?? q.required,
                options: data.options?.map((o) => ({
                  value: o.value || q.options?.find((opt) => opt.label === o.label)?.value || crypto.randomUUID(),
                  label: o.label,
                  active: o.active ?? true,
                })) ?? q.options,
              }
            : q,
        ),
      );
    } else {
      toast.error(result.error);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const result = await removeQuestion(eventId, deleteTarget.id);
    setDeleteLoading(false);
    if (result.success) {
      toast.success(typeof result.data === 'string' ? result.data : 'Question removed.');
      setDeleteTarget(null);
      // Update local state: section dividers are always hard-deleted; others are soft-deleted if applications exist
      const isSectionDivider = deleteTarget.type === 'section_divider';
      const shouldHardDelete = !hasApplications || isSectionDivider;
      setQuestions(
        shouldHardDelete
          ? questions.filter((q) => q.id !== deleteTarget.id)
          : questions.map((q) =>
              q.id === deleteTarget.id ? { ...q, active: false } : q,
            ),
      );
    } else {
      toast.error(result.error);
    }
  };

  // ── Reorder (Drag & Drop) ────────────────────────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveDragId(null);
      return;
    }

    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      setActiveDragId(null);
      return;
    }

    const newQuestions = arrayMove(questions, oldIndex, newIndex);
    setQuestions(newQuestions);
    setActiveDragId(null);

    const orderedIds = newQuestions.map((q) => q.id);
    const result = await reorderQuestions(eventId, orderedIds);
    if (!result.success) {
      toast.error(result.error);
      setQuestions(questions); // revert on error
    } else {
      toast.success('Questions reordered.');
    }
  };

  // ── Reactivate ───────────────────────────────────────────────────────────
  const handleReactivate = async (questionId: string) => {
    const result = await reactivateQuestion(eventId, questionId);
    if (result.success) {
      toast.success('Question reactivated.');
      setQuestions(
        questions.map((q) =>
          q.id === questionId ? { ...q, active: true } : q,
        ),
      );
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className='space-y-3'>
      {questions.length === 0 && (
        <p className='text-muted-foreground py-4 text-center text-sm'>
          No questions yet. Add one below.
        </p>
      )}

      {isMounted && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveDragId(event.active.id as string)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragId(null)}
        >
          <SortableContext
            items={questions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            {questions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                isFirst={false}
                isLast={false}
                onEdit={() => setEditTarget(q)}
                onDelete={() => setDeleteTarget(q)}
                onMoveUp={() => {}}
                onMoveDown={() => {}}
                onReactivate={() => handleReactivate(q.id)}
                isDragging={activeDragId === q.id}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      <Button
        variant='outline'
        className='w-full'
        onClick={() => setAddOpen(true)}
      >
        <Plus className='mr-2 size-4' />
        Add Question
      </Button>

      {/* Add dialog */}
      <QuestionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        hasApplications={hasApplications}
        onSubmit={handleAdd}
      />

      {/* Edit dialog */}
      <QuestionDialog
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        question={editTarget ?? undefined}
        hasApplications={hasApplications}
        onSubmit={handleEdit}
      />

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteQuestionDialog
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          questionLabel={deleteTarget.label}
          questionType={deleteTarget.type}
          hasApplications={hasApplications}
          onConfirm={handleDelete}
          isLoading={deleteLoading}
        />
      )}
    </div>
  );
}
