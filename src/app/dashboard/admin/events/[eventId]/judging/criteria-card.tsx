'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react';

import {
  saveJudgingCriteria,
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
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CRITERION_DESCRIPTION_MAX_LENGTH,
  CRITERION_NAME_MAX_LENGTH,
  criterionWeightsSumToOne,
  formatWeight,
  MAX_CRITERIA,
  roundedWeights,
} from '@/lib/judging/limits';

type DraftRow = {
  /** Stable React key and element-id suffix; the criterion id once saved. */
  key: string;
  /** Absent for a row added since the last save. */
  id?: string;
  name: string;
  description: string;
  weight: string;
};

function toDraft(criteria: JudgingCriterionRow[]): DraftRow[] {
  const weights = roundedWeights(criteria.map((c) => c.weight));
  return criteria.map((criterion, index) => ({
    key: criterion.id,
    id: criterion.id,
    name: criterion.name,
    description: criterion.description,
    weight: formatWeight(weights[index]),
  }));
}

/** A typed weight, or null while it isn't a number. */
function parseWeight(value: string): number | null {
  if (value.trim() === '') return null;
  const weight = Number(value);
  return Number.isFinite(weight) ? weight : null;
}

/**
 * What judges compare on, edited as one table and saved together. Weights are
 * fractions of the Overall score and must add up to 1. Freely editable until
 * the first vote; after that only names, descriptions and weights change
 * (weights only re-sort the Overall results).
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
  const baseId = React.useId();
  const nextKey = React.useRef(0);
  const [rows, setRows] = React.useState(() => toDraft(criteria));
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);

  // Take the server's list whenever it actually changes (after a save, or
  // another organizer's), but not on every re-render of the page, which
  // would wipe unsaved edits.
  const savedKey = JSON.stringify(criteria);
  const [syncedKey, setSyncedKey] = React.useState(savedKey);
  if (syncedKey !== savedKey) {
    setSyncedKey(savedKey);
    setRows(toDraft(criteria));
    setError(undefined);
  }

  const initial = React.useMemo(() => toDraft(criteria), [criteria]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const weights = rows.map((row) => parseWeight(row.weight));
  const sum = weights.reduce<number>((total, w) => total + (w ?? 0), 0);
  const sumOk =
    rows.length === 0 ||
    (weights.every((w) => w !== null) &&
      criterionWeightsSumToOne(weights as number[]));

  function edit(index: number, patch: Partial<DraftRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
    setError(undefined);
  }

  function move(index: number, by: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
    setError(undefined);
  }

  function remove(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setError(undefined);
  }

  function add() {
    nextKey.current += 1;
    setRows((prev) => [
      ...prev,
      {
        key: `new-${nextKey.current}`,
        name: '',
        description: '',
        weight: prev.length === 0 ? '1' : '0',
      },
    ]);
    setError(undefined);
  }

  function normalize() {
    const next = roundedWeights(weights.map((w) => w ?? 0));
    setRows((prev) =>
      prev.map((row, i) => ({ ...row, weight: formatWeight(next[i]) })),
    );
    setError(undefined);
  }

  function discard() {
    setRows(initial);
    setError(undefined);
  }

  function validate(): string | null {
    if (rows.some((row) => row.name.trim() === '')) {
      return 'Give every criterion a name.';
    }
    if (weights.some((w) => w === null)) {
      return 'Enter a weight for every criterion.';
    }
    if (weights.some((w) => w! < 0 || w! > 1)) {
      return 'Each weight is a fraction of 1, like 0.25.';
    }
    if (!sumOk) {
      return `Weights must add up to 1; these add up to ${formatWeight(sum)}.`;
    }
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      const result = await saveJudgingCriteria(
        eventId,
        rows.map((row, index) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          weight: weights[index]!,
        })),
      );
      if (!result.success) setError(result.error);
    } catch (err) {
      console.error('Failed to save criteria:', err);
      setError('Couldn’t save the criteria. Try again.');
    } finally {
      setSaving(false);
    }
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
            'Judges pick the better of two projects on each criterion. Weights are each criterion’s share of the Overall score and add up to 1. Judges can’t be sent out until there is at least one criterion.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className='flex flex-col gap-3'>
          {rows.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No criteria yet.</p>
          ) : (
            <Table className='min-w-xl'>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-1/3'>Name</TableHead>
                  <TableHead>One-line description, shown to judges</TableHead>
                  <TableHead className='w-24'>Weight</TableHead>
                  {!structureLocked && (
                    <TableHead className='w-28'>
                      <span className='sr-only'>Order and remove</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const label = row.name.trim() || `criterion ${index + 1}`;
                  const rowId = `${baseId}-${row.key}`;
                  return (
                    <TableRow key={row.key}>
                      <TableCell className='align-top'>
                        <Input
                          id={`${rowId}-name`}
                          aria-label={`Name of ${label}`}
                          value={row.name}
                          maxLength={CRITERION_NAME_MAX_LENGTH}
                          placeholder='Technical execution'
                          onChange={(e) =>
                            edit(index, { name: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell className='align-top'>
                        <Input
                          id={`${rowId}-description`}
                          aria-label={`Description of ${label}`}
                          value={row.description}
                          maxLength={CRITERION_DESCRIPTION_MAX_LENGTH}
                          placeholder='Does it work? Was it hard to build?'
                          onChange={(e) =>
                            edit(index, { description: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell className='align-top'>
                        <Input
                          id={`${rowId}-weight`}
                          aria-label={`Weight of ${label}`}
                          type='number'
                          inputMode='decimal'
                          min={0}
                          max={1}
                          step='any'
                          aria-invalid={!sumOk || weights[index] === null}
                          value={row.weight}
                          onChange={(e) =>
                            edit(index, { weight: e.target.value })
                          }
                        />
                      </TableCell>
                      {!structureLocked && (
                        <TableCell className='align-top'>
                          <div className='flex items-center justify-end gap-1'>
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              aria-label={`Move ${label} up`}
                              disabled={index === 0 || saving}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              aria-label={`Move ${label} down`}
                              disabled={index === rows.length - 1 || saving}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown />
                            </Button>
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              aria-label={`Remove ${label}`}
                              className='hover:text-destructive'
                              disabled={saving}
                              onClick={() => remove(index)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className='text-right'>
                    Total
                  </TableCell>
                  <TableCell
                    className={sumOk ? undefined : 'text-destructive'}
                    aria-live='polite'
                  >
                    {formatWeight(sum)}
                  </TableCell>
                  {!structureLocked && <TableCell />}
                </TableRow>
              </TableFooter>
            </Table>
          )}

          {error && <FieldError>{error}</FieldError>}

          <div className='flex flex-wrap items-center gap-2'>
            {!structureLocked && (
              <Button
                type='button'
                variant='outline'
                onClick={add}
                disabled={saving || rows.length >= MAX_CRITERIA}
              >
                <Plus data-icon='inline-start' />
                Add criterion
              </Button>
            )}
            {rows.length > 0 && (
              <Button
                type='button'
                variant='ghost'
                onClick={normalize}
                disabled={saving || sumOk}
              >
                Make weights add up to 1
              </Button>
            )}
            <div className='ml-auto flex gap-2'>
              {dirty && (
                <Button
                  type='button'
                  variant='ghost'
                  onClick={discard}
                  disabled={saving}
                >
                  Discard changes
                </Button>
              )}
              <Button type='submit' disabled={saving || !dirty}>
                {saving && <Spinner data-icon='inline-start' />}
                Save criteria
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
