'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import type { ApplicationQuestion } from '@/types/application';
import { APPLICATION_QUESTION_TYPES } from '@/types/application';
import QuestionDialog from './question-dialog';
import {
  addQuestion,
  editQuestion,
  removeQuestion,
  reorderQuestions,
  updateEventResponseSettings,
} from '@/app/dashboard/events/[eventId]/form-builder/actions';

type FormBuilderProps = {
  eventId: string;
  eventName: string;
  initialQuestions: ApplicationQuestion[];
  hasApplications: boolean;
  allowResponseUpdate: boolean;
  allowMultipleResponses: boolean;
};

function getTypeLabel(type: string): string {
  return (
    APPLICATION_QUESTION_TYPES.find((t) => t.value === type)?.label ?? type
  );
}

export default function FormBuilder({
  eventId,
  eventName,
  initialQuestions,
  hasApplications,
  allowResponseUpdate: initialAllowUpdate,
  allowMultipleResponses: initialAllowMultiple,
}: FormBuilderProps) {
  const [questions, setQuestions] =
    React.useState<ApplicationQuestion[]>(initialQuestions);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingQuestion, setEditingQuestion] = React.useState<
    ApplicationQuestion | undefined
  >();
  const [loading, setLoading] = React.useState(false);
  const [allowUpdate, setAllowUpdate] = React.useState(initialAllowUpdate);
  const [allowMultiple, setAllowMultiple] =
    React.useState(initialAllowMultiple);

  async function handleToggleUpdate(checked: boolean) {
    setAllowUpdate(checked);
    const result = await updateEventResponseSettings(eventId, {
      allowResponseUpdate: checked,
    });
    if (!result.success) {
      toast.error('Failed to update setting');
      setAllowUpdate(!checked);
    }
  }

  async function handleToggleMultiple(checked: boolean) {
    setAllowMultiple(checked);
    const result = await updateEventResponseSettings(eventId, {
      allowMultipleResponses: checked,
    });
    if (!result.success) {
      toast.error('Failed to update setting');
      setAllowMultiple(!checked);
    }
  }

  const activeQuestions = questions
    .filter((q) => q.active)
    .sort((a, b) => a.order - b.order);

  const inactiveQuestions = questions.filter((q) => !q.active);

  function openAddDialog() {
    setEditingQuestion(undefined);
    setDialogOpen(true);
  }

  function openEditDialog(question: ApplicationQuestion) {
    setEditingQuestion(question);
    setDialogOpen(true);
  }

  async function handleSave(question: ApplicationQuestion) {
    setLoading(true);
    try {
      if (editingQuestion) {
        const result = await editQuestion(eventId, question.id, {
          label: question.label,
          description: question.description,
          type: question.type,
          required: question.required,
          options: question.options,
        });
        if (result.success && result.data) {
          setQuestions(result.data);
          toast.success('Question updated');
        } else if (!result.success) {
          toast.error(result.error);
        }
      } else {
        const result = await addQuestion(eventId, {
          id: question.id,
          label: question.label,
          description: question.description,
          type: question.type,
          required: question.required,
          options: question.options,
        });
        if (result.success && result.data) {
          setQuestions(result.data);
          toast.success('Question added');
        } else if (!result.success) {
          toast.error(result.error);
        }
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(questionId: string) {
    setLoading(true);
    try {
      const result = await removeQuestion(eventId, questionId);
      if (result.success && result.data) {
        setQuestions(result.data);
        const wasDeactivated = result.data.some(
          (q) => q.id === questionId && !q.active,
        );
        toast.success(
          wasDeactivated
            ? 'Question deactivated (responses exist)'
            : 'Question removed',
        );
      } else if (!result.success) {
        toast.error(result.error);
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleMove(questionId: string, direction: 'up' | 'down') {
    const idx = activeQuestions.findIndex((q) => q.id === questionId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === activeQuestions.length - 1) return;

    const newOrder = [...activeQuestions];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];

    const orderedIds = newOrder.map((q) => q.id);
    setLoading(true);
    try {
      const result = await reorderQuestions(eventId, orderedIds);
      if (result.success && result.data) {
        setQuestions(result.data);
      } else if (!result.success) {
        toast.error(result.error);
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Card className='w-full'>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle>Form Builder: {eventName}</CardTitle>
              <CardDescription>
                Manage application questions for this event.
                {hasApplications && (
                  <span className='text-amber-600'>
                    {' '}
                    Applications exist — some edits are restricted.
                  </span>
                )}
              </CardDescription>
            </div>
            <Button onClick={openAddDialog} disabled={loading}>
              <Plus className='mr-1 size-4' />
              Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Response settings */}
          <div className='mb-6 space-y-4'>
            <h4 className='text-sm font-medium'>Response Settings</h4>
            <div className='flex items-center justify-between'>
              <div>
                <Label htmlFor='allow-update'>Allow response updates</Label>
                <p className='text-muted-foreground text-xs'>
                  Applicants can edit their submitted responses.
                </p>
              </div>
              <Switch
                id='allow-update'
                checked={allowUpdate}
                onCheckedChange={handleToggleUpdate}
              />
            </div>
            <div className='flex items-center justify-between'>
              <div>
                <Label htmlFor='allow-multiple'>Allow multiple responses</Label>
                <p className='text-muted-foreground text-xs'>
                  Applicants can submit more than one application.
                </p>
              </div>
              <Switch
                id='allow-multiple'
                checked={allowMultiple}
                onCheckedChange={handleToggleMultiple}
              />
            </div>
            <Separator />
          </div>

          {activeQuestions.length === 0 ? (
            <div className='text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12'>
              <p className='text-sm'>No questions yet.</p>
              <Button
                variant='outline'
                size='sm'
                className='mt-3'
                onClick={openAddDialog}
              >
                <Plus className='mr-1 size-4' />
                Add your first question
              </Button>
            </div>
          ) : (
            <div className='space-y-3'>
              {activeQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className='flex items-start gap-3 rounded-lg border p-4'
                >
                  <div className='text-muted-foreground flex flex-col items-center gap-1 pt-1'>
                    <GripVertical className='size-4' />
                    <span className='text-xs font-medium'>{idx + 1}</span>
                  </div>

                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <h4 className='truncate text-sm font-medium'>
                        {q.label}
                      </h4>
                      {q.required && (
                        <span className='bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-xs'>
                          Required
                        </span>
                      )}
                    </div>
                    {q.description && (
                      <p className='text-muted-foreground mt-0.5 text-xs'>
                        {q.description}
                      </p>
                    )}
                    <div className='mt-1 flex items-center gap-2'>
                      <span className='bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs'>
                        {getTypeLabel(q.type)}
                      </span>
                      {q.options && q.options.length > 0 && (
                        <span className='text-muted-foreground text-xs'>
                          {q.options.length} option
                          {q.options.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className='flex items-center gap-1'>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-8'
                      disabled={idx === 0 || loading}
                      onClick={() => handleMove(q.id, 'up')}
                    >
                      <ArrowUp className='size-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-8'
                      disabled={idx === activeQuestions.length - 1 || loading}
                      onClick={() => handleMove(q.id, 'down')}
                    >
                      <ArrowDown className='size-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-8'
                      disabled={loading}
                      onClick={() => openEditDialog(q)}
                    >
                      <Pencil className='size-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-8'
                      disabled={loading}
                      onClick={() => handleRemove(q.id)}
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {inactiveQuestions.length > 0 && (
            <div className='mt-6'>
              <h4 className='text-muted-foreground mb-2 text-sm font-medium'>
                Inactive Questions ({inactiveQuestions.length})
              </h4>
              <div className='space-y-2'>
                {inactiveQuestions.map((q) => (
                  <div
                    key={q.id}
                    className='text-muted-foreground flex items-center gap-3 rounded-lg border border-dashed p-3 opacity-60'
                  >
                    <div className='min-w-0 flex-1'>
                      <span className='text-sm line-through'>{q.label}</span>
                      <span className='ml-2 text-xs'>
                        ({getTypeLabel(q.type)})
                      </span>
                    </div>
                    <span className='text-xs'>Preserved for history</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <QuestionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        question={editingQuestion}
        typeLocked={!!editingQuestion && hasApplications}
        onSave={handleSave}
      />
    </>
  );
}
