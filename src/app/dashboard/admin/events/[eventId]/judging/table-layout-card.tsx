'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';

import { updateJudgingTableLayout } from '@/app/dashboard/admin/events/judging-actions';
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  formatTableLabel,
  MAX_TABLE_ROWS,
  TABLE_ALPHABET_LABELS,
  TABLE_ALPHABETS,
  type TableAlphabet,
  type TableLayout,
} from '@/lib/judging/table-label';

type Draft = {
  rows: string;
  rowAlphabet: TableAlphabet;
  columnAlphabet: TableAlphabet;
};

const PREVIEW_COUNT = 8;

function toDraft(layout: TableLayout): Draft {
  return { ...layout, rows: String(layout.rows) };
}

/**
 * How table slots are labelled on the expo floor. Tables fill column by
 * column across the rows, so every row grows evenly and a table's label never
 * changes as more projects are published. Locked once judging starts.
 */
export function TableLayoutCard({
  eventId,
  layout,
  locked,
}: {
  eventId: string;
  layout: TableLayout;
  locked: boolean;
}) {
  const [draft, setDraft] = React.useState(() => toDraft(layout));
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);

  const rows = Number(draft.rows);
  const rowsValid =
    Number.isInteger(rows) && rows >= 1 && rows <= MAX_TABLE_ROWS;
  const dirty =
    draft.rows !== String(layout.rows) ||
    draft.rowAlphabet !== layout.rowAlphabet ||
    draft.columnAlphabet !== layout.columnAlphabet;
  const preview = rowsValid
    ? Array.from({ length: PREVIEW_COUNT }, (_, slot) =>
        formatTableLabel(slot, { ...draft, rows }),
      )
    : [];

  function change<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setError(undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!rowsValid) {
      setError(`Enter a whole number of rows from 1 to ${MAX_TABLE_ROWS}.`);
      return;
    }
    setSaving(true);
    try {
      const result = await updateJudgingTableLayout(eventId, {
        ...draft,
        rows,
      });
      if (!result.success) setError(result.error);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Table layout</CardTitle>
        <CardDescription>
          {locked ? (
            <span className='inline-flex items-center gap-1.5'>
              <Lock aria-hidden className='size-3.5' />
              Judging has started, so tables can no longer be relabelled.
            </span>
          ) : (
            'How tables are labelled on the expo floor. Changing this relabels every table, so set it before printing signs.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup className='gap-3'>
            <div className='grid gap-3 sm:grid-cols-3'>
              <Field>
                <FieldLabel htmlFor='table-rows'>Rows</FieldLabel>
                <Input
                  id='table-rows'
                  type='number'
                  inputMode='numeric'
                  min={1}
                  max={MAX_TABLE_ROWS}
                  step={1}
                  disabled={locked}
                  aria-invalid={Boolean(error)}
                  value={draft.rows}
                  onChange={(e) => change('rows', e.target.value)}
                />
              </Field>
              <AlphabetField
                id='table-row-alphabet'
                label='Row labels'
                value={draft.rowAlphabet}
                disabled={locked || rows === 1}
                onChange={(value) => change('rowAlphabet', value)}
              />
              <AlphabetField
                id='table-column-alphabet'
                label={rows === 1 ? 'Table labels' : 'Column labels'}
                value={draft.columnAlphabet}
                disabled={locked}
                onChange={(value) => change('columnAlphabet', value)}
              />
            </div>
            <FieldDescription>
              {preview.length > 0
                ? `Tables are handed out in this order: ${preview.join(', ')}, …`
                : 'Enter a number of rows to see the labels.'}
            </FieldDescription>
            {error && <FieldError>{error}</FieldError>}
            {!locked && (
              <div className='flex justify-end'>
                <Button type='submit' disabled={saving || !dirty}>
                  {saving && <Spinner data-icon='inline-start' />}
                  Save layout
                </Button>
              </div>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function AlphabetField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: TableAlphabet;
  disabled: boolean;
  onChange: (value: TableAlphabet) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => onChange(next as TableAlphabet)}
      >
        <SelectTrigger id={id} className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TABLE_ALPHABETS.map((alphabet) => (
            <SelectItem key={alphabet} value={alphabet}>
              {TABLE_ALPHABET_LABELS[alphabet]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
