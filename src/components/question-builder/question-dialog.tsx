'use client';

import * as React from 'react';
import { useForm, Controller, useFieldArray, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X, ChevronUp, ChevronDown, ArrowUpAZ } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldDescription,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApplicationQuestion } from '@/types/application';

const QUESTION_TYPES = [
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Checkbox (Yes/No)' },
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'section_divider', label: 'Section Divider' },
] as const;

const formSchema = z.object({
  label: z.string().trim().min(1, 'Label is required'),
  description: z.string().trim().optional(),
  type: z.enum(['short_text', 'long_text', 'single_select', 'multi_select', 'number', 'boolean', 'section_divider']),
  required: z.boolean().default(false),
  options: z.array(
    z.object({
      value: z.string().optional(),
      label: z.string().trim().min(1, 'Option label is required'),
      active: z.boolean().default(true),
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

type QuestionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing question when editing; undefined when adding. */
  question?: ApplicationQuestion;
  /** Whether this event has existing applications (locks type field). */
  hasApplications: boolean;
  onSubmit: (data: FormValues) => Promise<void>;
};

type OptionItemProps = {
  index: number;
  fieldId: string;
  hasResponses: boolean;
  isDragging?: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  register: any;
  control: any;
  errors?: any;
};

function OptionItem({
  index,
  fieldId,
  hasResponses,
  isDragging,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  register,
  control,
  errors,
}: OptionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: fieldId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className='flex items-center gap-2'
    >
      <button
        {...attributes}
        {...listeners}
        className='cursor-grab active:cursor-grabbing pt-0.5'
        aria-label='Drag to reorder'
        type='button'
      >
        <div className='size-4 text-muted-foreground flex items-center justify-center text-xs'>⋮⋮</div>
      </button>
      <Input
        {...register(`options.${index}.label`)}
        placeholder={`Option ${index + 1}`}
        className='flex-1'
      />
      {hasResponses && (
        <Controller
          name={`options.${index}.active`}
          control={control}
          render={({ field: f }) => (
            <div className='flex items-center gap-1.5'>
              <Switch
                id={`opt-active-${index}`}
                checked={f.value}
                onCheckedChange={f.onChange}
                className='scale-75'
              />
              <Label
                htmlFor={`opt-active-${index}`}
                className='text-muted-foreground text-xs whitespace-nowrap'
              >
                {f.value ? 'Active' : 'Hidden'}
              </Label>
            </div>
          )}
        />
      )}
      {!hasResponses && (
        <div className='flex gap-0.5'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8 shrink-0'
            disabled={isFirst}
            onClick={onMoveUp}
          >
            <ChevronUp className='size-4' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8 shrink-0'
            disabled={isLast}
            onClick={onMoveDown}
          >
            <ChevronDown className='size-4' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8 shrink-0'
            onClick={onRemove}
          >
            <X className='size-4' />
          </Button>
        </div>
      )}
      {errors && (
        <FieldError errors={[errors]} />
      )}
    </div>
  );
}

export function QuestionDialog({
  open,
  onOpenChange,
  question,
  hasApplications,
  onSubmit,
}: QuestionDialogProps) {
  const isEdit = !!question;
  const [isMounted, setIsMounted] = React.useState(false);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setIsMounted(true);
    }
  }, [open]);

  const sensors = useSensors(
    useSensor(PointerSensor),
  );

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: question
      ? {
          label: question.label,
          description: question.description ?? '',
          type: question.type,
          required: question.required,
          options: question.options?.map((o) => ({
            value: o.value,
            label: o.label,
            active: o.active,
          })) ?? [],
        }
      : {
          label: '',
          description: '',
          type: 'short_text',
          required: false,
          options: [],
        },
  });

  const { fields, append, remove, move } = useFieldArray({ control, name: 'options' });
  const questionType = watch('type');
  const options = watch('options');
  const showOptions = questionType === 'single_select' || questionType === 'multi_select';

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveDragId(null);
      return;
    }

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      setActiveDragId(null);
      return;
    }

    move(oldIndex, newIndex);
    setActiveDragId(null);
  };

  const handleSortAlphabetically = () => {
    // Create indexed array of current options with their positions
    const indexed = options.map((opt, idx) => ({ opt, currentIndex: idx }));

    // Sort by label alphabetically
    indexed.sort((a, b) => a.opt.label.localeCompare(b.opt.label));

    // Build the correct sequence of moves
    // For each target position, find where that item currently is and move it there
    let currentFields = [...fields];
    for (let targetIdx = 0; targetIdx < indexed.length; targetIdx++) {
      const itemToMove = indexed[targetIdx];
      const currentIdx = currentFields.findIndex(f => f.id === fields[itemToMove.currentIndex].id);

      if (currentIdx !== targetIdx) {
        move(currentIdx, targetIdx);
        // Update our tracking array
        const [moved] = currentFields.splice(currentIdx, 1);
        currentFields.splice(targetIdx, 0, moved);
      }
    }
  };

  // Reset form when dialog opens with new data
  React.useEffect(() => {
    if (open) {
      reset(
        question
          ? {
              label: question.label,
              description: question.description ?? '',
              type: question.type,
              required: question.required,
              options: question.options?.map((o) => ({
                value: o.value,
                label: o.label,
                active: o.active,
              })) ?? [],
            }
          : {
              label: '',
              description: '',
              type: 'short_text',
              required: false,
              options: [],
            },
      );
    }
  }, [open, question, reset]);

  const submitHandler = async (data: FormValues) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Question' : 'Add Question'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submitHandler)} className='space-y-0'>
          <FieldGroup className='gap-4'>
            {/* Label */}
            <Field>
              <FieldLabel htmlFor='q-label'>
                Label <span className='text-destructive'>*</span>
              </FieldLabel>
              <Input
                id='q-label'
                {...register('label')}
                placeholder='e.g. Why do you want to attend?'
              />
              {errors.label && <FieldError errors={[errors.label]} />}
            </Field>

            {/* Description */}
            <Field>
              <FieldLabel htmlFor='q-description'>Description</FieldLabel>
              <FieldDescription>Optional helper text shown below the label.</FieldDescription>
              <Textarea
                id='q-description'
                {...register('description')}
                placeholder='Optional helper text'
                rows={2}
              />
            </Field>

            {/* Type */}
            <Field>
              <FieldLabel>
                Type <span className='text-destructive'>*</span>
              </FieldLabel>
              {isEdit && hasApplications && (
                <FieldDescription>
                  Type cannot be changed because applications already exist.
                </FieldDescription>
              )}
              <Controller
                name='type'
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit && hasApplications}
                  >
                    <SelectTrigger id='q-type'>
                      <SelectValue placeholder='Select type' />
                    </SelectTrigger>
                    <SelectContent>
                      {QUESTION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.type && <FieldError errors={[errors.type]} />}
            </Field>

            {/* Required */}
            {questionType !== 'section_divider' && (
              <div className='flex items-center gap-3'>
                <Controller
                  name='required'
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id='q-required'
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor='q-required'>Required</Label>
              </div>
            )}

            {/* Options (for select types) */}
            {showOptions && (
              <Field>
                <div className='flex items-center justify-between'>
                  <FieldLabel>Options</FieldLabel>
                  {fields.length > 1 && (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={handleSortAlphabetically}
                    >
                      <ArrowUpAZ className='mr-1 size-3' /> Sort A-Z
                    </Button>
                  )}
                </div>
                {isMounted ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={(event) => setActiveDragId(event.active.id as string)}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setActiveDragId(null)}
                  >
                    <SortableContext
                      items={fields.map((f) => f.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className='space-y-2'>
                        {fields.map((field, index) => {
                          const hasResponses = isEdit && hasApplications;
                          return (
                            <OptionItem
                              key={field.id}
                              index={index}
                              fieldId={field.id}
                              hasResponses={hasResponses}
                              isDragging={activeDragId === field.id}
                              isFirst={index === 0}
                              isLast={index === fields.length - 1}
                              onMoveUp={() => move(index, index - 1)}
                              onMoveDown={() => move(index, index + 1)}
                              onRemove={() => remove(index)}
                              register={register}
                              control={control}
                              errors={errors.options?.[index]?.label}
                            />
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className='space-y-2'>
                    {fields.map((field, index) => (
                      <div key={field.id} className='flex items-center gap-2'>
                        <Input
                          {...register(`options.${index}.label`)}
                          placeholder={`Option ${index + 1}`}
                          className='flex-1'
                        />
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='size-8 shrink-0'
                          onClick={() => remove(index)}
                        >
                          <X className='size-4' />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => append({ label: '', active: true })}
                >
                  <Plus className='mr-1 size-3' /> Add Option
                </Button>
              </Field>
            )}
          </FieldGroup>

          <DialogFooter className='mt-6'>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Question'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
