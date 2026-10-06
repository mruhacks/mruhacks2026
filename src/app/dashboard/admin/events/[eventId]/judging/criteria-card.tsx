'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Lock, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  createJudgingCriterion,
  deleteJudgingCriterion,
  moveJudgingCriterion,
  updateJudgingCriterion,
  type JudgingCriterionRow,
} from '@/app/dashboard/admin/events/judging-actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  CRITERION_DESCRIPTION_MAX_LENGTH,
  CRITERION_MAX_WEIGHT,
  CRITERION_NAME_MAX_LENGTH,
} from '@/lib/judging/limits';

type Draft = { name: string; description: string; weight: string };

const EMPTY_DRAFT: Draft = { name: '', description: '', weight: '1' };

/**
 * What judges compare on. Freely editable until the first vote; after that
 * only names, descriptions and weights change (weights only re-sort the
 * Overall results).
 */
export function CriteriaCard({
  eventId,
  criteria,
  structureLocked,
}: {
  eventId: string;
  criteria: JudgingCriterionRow[];
  structureLocked: boolean;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function runRowAction(
    id: string,
    action: () => Promise<{ success: boolean; error?: string }>,
  ) {
    setBusyId(id);
    const result = await action();
    setBusyId(null);
    // Button-only actions: nothing to anchor an inline error to.
    if (!result.success) toast.error(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criteria</CardTitle>
        <CardDescription>
          {structureLocked ? (
            <span className='inline-flex items-center gap-1.5'>
              <Lock aria-hidden className='size-3.5' />
              Judging has started: criteria can be renamed and reweighted, but
              not added, removed or reordered.
            </span>
          ) : (
            'Judges pick the better of two projects on each criterion. Judges can’t be sent out until there is at least one.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {criteria.length === 0 && !adding && (
          <p className='text-muted-foreground text-sm'>No criteria yet.</p>
        )}
        <ol className='flex flex-col gap-2'>
          {criteria.map((criterion, index) =>
            editingId === criterion.id ? (
              <li key={criterion.id}>
                <CriterionForm
                  initial={{
                    name: criterion.name,
                    description: criterion.description,
                    weight: String(criterion.weight),
                  }}
                  submitLabel='Save'
                  onCancel={() => setEditingId(null)}
                  onSubmit={(input) =>
                    updateJudgingCriterion(eventId, criterion.id, input)
                  }
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={criterion.id}
                className='flex items-start gap-3 rounded-lg border p-3'
              >
                <div className='min-w-0 flex-1'>
                  <p className='m-0 font-medium'>
                    {criterion.name}{' '}
                    <span className='text-muted-foreground text-xs font-normal'>
                      weight {criterion.weight}
                    </span>
                  </p>
                  {criterion.description && (
                    <p className='text-muted-foreground m-0 text-sm'>
                      {criterion.description}
                    </p>
                  )}
                </div>
                <div className='flex shrink-0 items-center gap-1'>
                  {!structureLocked && (
                    <>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={`Move ${criterion.name} up`}
                        disabled={index === 0 || busyId !== null}
                        onClick={() =>
                          runRowAction(criterion.id, () =>
                            moveJudgingCriterion(eventId, criterion.id, 'up'),
                          )
                        }
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={`Move ${criterion.name} down`}
                        disabled={
                          index === criteria.length - 1 || busyId !== null
                        }
                        onClick={() =>
                          runRowAction(criterion.id, () =>
                            moveJudgingCriterion(eventId, criterion.id, 'down'),
                          )
                        }
                      >
                        <ArrowDown />
                      </Button>
                    </>
                  )}
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={`Edit ${criterion.name}`}
                    disabled={busyId !== null}
                    onClick={() => setEditingId(criterion.id)}
                  >
                    <Pencil />
                  </Button>
                  {!structureLocked && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      aria-label={`Remove ${criterion.name}`}
                      className='hover:text-destructive'
                      disabled={busyId !== null}
                      onClick={() =>
                        runRowAction(criterion.id, () =>
                          deleteJudgingCriterion(eventId, criterion.id),
                        )
                      }
                    >
                      {busyId === criterion.id ? <Spinner /> : <Trash2 />}
                    </Button>
                  )}
                </div>
              </li>
            ),
          )}
        </ol>

        {!structureLocked &&
          (adding ? (
            <CriterionForm
              initial={EMPTY_DRAFT}
              submitLabel='Add criterion'
              onCancel={() => setAdding(false)}
              onSubmit={(input) => createJudgingCriterion(eventId, input)}
              onDone={() => setAdding(false)}
            />
          ) : (
            <Button
              type='button'
              variant='outline'
              className='self-start'
              onClick={() => setAdding(true)}
            >
              Add criterion
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}

function CriterionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDone,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (input: {
    name: string;
    description: string;
    weight: number;
  }) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = React.useState(initial);
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);

  function change(field: keyof Draft, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setError(undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const weight = Number(draft.weight);
    if (draft.weight.trim() === '' || !Number.isFinite(weight)) {
      setError('Enter a weight.');
      return;
    }
    setSaving(true);
    const result = await onSubmit({
      name: draft.name,
      description: draft.description,
      weight,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className='rounded-lg border p-3'>
      <FieldGroup className='gap-3'>
        <div className='grid gap-3 sm:grid-cols-[1fr_7rem]'>
          <Field>
            <FieldLabel htmlFor='criterion-name'>Name</FieldLabel>
            <Input
              id='criterion-name'
              value={draft.name}
              maxLength={CRITERION_NAME_MAX_LENGTH}
              placeholder='Technical execution'
              onChange={(e) => change('name', e.target.value)}
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='criterion-weight'>Weight</FieldLabel>
            <Input
              id='criterion-weight'
              type='number'
              inputMode='decimal'
              min={0}
              max={CRITERION_MAX_WEIGHT}
              step='any'
              value={draft.weight}
              onChange={(e) => change('weight', e.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor='criterion-description'>
            One-line description, shown to judges
          </FieldLabel>
          <Input
            id='criterion-description'
            value={draft.description}
            maxLength={CRITERION_DESCRIPTION_MAX_LENGTH}
            placeholder='Does it work? Was it hard to build?'
            onChange={(e) => change('description', e.target.value)}
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <div className='flex justify-end gap-2'>
          <Button
            type='button'
            variant='ghost'
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={saving}>
            {saving && <Spinner data-icon='inline-start' />}
            {submitLabel}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
