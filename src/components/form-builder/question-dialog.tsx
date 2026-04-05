'use client';

import * as React from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import type {
  ApplicationQuestion,
  ApplicationQuestionType,
  ApplicationQuestionOption,
} from '@/types/application';
import { APPLICATION_QUESTION_TYPES } from '@/types/application';
import { Plus, Trash2 } from 'lucide-react';

type QuestionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, we are editing; otherwise adding. */
  question?: ApplicationQuestion;
  /** Whether type is locked (responses exist for this question). */
  typeLocked?: boolean;
  onSave: (question: ApplicationQuestion) => void;
};

const TYPES_WITH_OPTIONS: ApplicationQuestionType[] = [
  'single_select',
  'multi_select',
];

export default function QuestionDialog({
  open,
  onOpenChange,
  question,
  typeLocked = false,
  onSave,
}: QuestionDialogProps) {
  const isEdit = !!question;

  const [label, setLabel] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [type, setType] = React.useState<ApplicationQuestionType>('short_text');
  const [required, setRequired] = React.useState(false);
  const [options, setOptions] = React.useState<ApplicationQuestionOption[]>([]);

  // Reset form when dialog opens/question changes
  React.useEffect(() => {
    if (open) {
      setLabel(question?.label ?? '');
      setDescription(question?.description ?? '');
      setType(question?.type ?? 'short_text');
      setRequired(question?.required ?? false);
      setOptions(question?.options ?? []);
    }
  }, [open, question]);

  const needsOptions = TYPES_WITH_OPTIONS.includes(type);

  function addOption() {
    setOptions((prev) => [...prev, { value: crypto.randomUUID(), label: '' }]);
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateOptionLabel(index: number, newLabel: string) {
    setOptions((prev) =>
      prev.map((o, i) => (i === index ? { ...o, label: newLabel } : o)),
    );
  }

  function handleSave() {
    if (!label.trim()) return;

    const result: ApplicationQuestion = {
      id: question?.id ?? crypto.randomUUID(),
      label: label.trim(),
      description: description.trim() || undefined,
      type,
      required,
      options: needsOptions ? options.filter((o) => o.label.trim()) : undefined,
      order: question?.order ?? 0,
      active: question?.active ?? true,
    };

    onSave(result);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Question' : 'Add Question'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modify the question details below.'
              : 'Configure a new application question.'}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {/* Label */}
          <div className='space-y-2'>
            <Label htmlFor='q-label'>Label *</Label>
            <Input
              id='q-label'
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='e.g. Why do you want to attend?'
            />
          </div>

          {/* Description */}
          <div className='space-y-2'>
            <Label htmlFor='q-description'>Description</Label>
            <Textarea
              id='q-description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Optional help text for applicants'
              rows={2}
            />
          </div>

          {/* Type */}
          <div className='space-y-2'>
            <Label htmlFor='q-type'>Type *</Label>
            <select
              id='q-type'
              value={type}
              onChange={(e) =>
                setType(e.target.value as ApplicationQuestionType)
              }
              disabled={typeLocked}
              className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50'
            >
              {APPLICATION_QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {typeLocked && (
              <p className='text-muted-foreground text-xs'>
                Type cannot be changed because responses exist.
              </p>
            )}
          </div>

          {/* Required */}
          <div className='flex items-center gap-3'>
            <Switch
              id='q-required'
              checked={required}
              onCheckedChange={setRequired}
            />
            <Label htmlFor='q-required'>Required</Label>
          </div>

          {/* Options (for select types) */}
          {needsOptions && (
            <div className='space-y-2'>
              <Label>Options</Label>
              <div className='space-y-2'>
                {options.map((opt, i) => (
                  <div key={opt.value} className='flex items-center gap-2'>
                    <Input
                      value={opt.label}
                      onChange={(e) => updateOptionLabel(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      className='flex-1'
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      onClick={() => removeOption(i)}
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={addOption}
              >
                <Plus className='mr-1 size-4' />
                Add Option
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!label.trim()}>
            {isEdit ? 'Save Changes' : 'Add Question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
