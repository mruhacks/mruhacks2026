'use client';

import * as React from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { MultiValue, SingleValue } from 'react-select';

import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldDescription,
} from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { type ActionResult } from '@/utils/action-result';

import {
  eventOnlySchema,
  type EventOnlyFormValues,
} from './schema';
import type { ApplicationQuestion } from '@/types/application';
import { useRouter } from 'next/navigation';
import type { Control } from 'react-hook-form';

function RequiredAsterisk(): React.JSX.Element {
  return <span className='text-destructive ml-0.5'>*</span>;
}

type ApplicationQuestionFieldProps = {
  question: ApplicationQuestion;
  control: Control<EventOnlyFormValues>;
};

function ApplicationQuestionField({
  question: q,
  control,
}: ApplicationQuestionFieldProps): React.JSX.Element {
  const fieldName = `applicationResponses.${q.id}` as const;
  const activeOptions = (q.options ?? [])
    .filter((o) => o.active)
    .map((o) => ({ value: o.value, label: o.label }));

  if (q.type === 'boolean') {
    return (
      <Controller
        name={fieldName}
        control={control}
        defaultValue={undefined}
        render={({ field }) => (
          <div className='flex items-start gap-3'>
            <Checkbox
              id={q.id}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
            <div className='grid gap-1'>
              <Label htmlFor={q.id}>
                {q.label}
                {q.required && <RequiredAsterisk />}
              </Label>
              {q.description && (
                <p className='text-muted-foreground text-sm'>{q.description}</p>
              )}
            </div>
          </div>
        )}
      />
    );
  }

  if (q.type === 'single_select') {
    return (
      <Controller
        name={fieldName}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>
              {q.label}
              {q.required && <RequiredAsterisk />}
            </FieldLabel>
            {q.description && <FieldDescription>{q.description}</FieldDescription>}
            <Select
              id={q.id}
              instanceId={`app-q-${q.id}`}
              options={activeOptions}
              value={activeOptions.find((o) => o.value === field.value) ?? null}
              onChange={(opt) =>
                field.onChange(
                  (opt as SingleValue<{ value: string; label: string }>)?.value ?? null,
                )
              }
            />
            {fieldState.error && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    );
  }

  if (q.type === 'multi_select') {
    return (
      <Controller
        name={fieldName}
        control={control}
        render={({ field, fieldState }) => {
          const selected = Array.isArray(field.value) ? (field.value as string[]) : [];
          return (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>
                {q.label}
                {q.required && <RequiredAsterisk />}
              </FieldLabel>
              {q.description && <FieldDescription>{q.description}</FieldDescription>}
              <Select
                id={q.id}
                instanceId={`app-q-${q.id}`}
                isMulti
                options={activeOptions}
                value={activeOptions.filter((o) => selected.includes(o.value))}
                onChange={(opts) =>
                  field.onChange(
                    (opts as MultiValue<{ value: string; label: string }>).map(
                      (o) => o.value,
                    ),
                  )
                }
              />
              {fieldState.error && <FieldError errors={[fieldState.error]} />}
            </Field>
          );
        }}
      />
    );
  }

  if (q.type === 'number') {
    return (
      <Controller
        name={fieldName}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>
              {q.label}
              {q.required && <RequiredAsterisk />}
            </FieldLabel>
            {q.description && <FieldDescription>{q.description}</FieldDescription>}
            <Input
              id={q.id}
              type='number'
              value={(field.value as number | '') ?? ''}
              onChange={(e) =>
                field.onChange(e.target.value === '' ? null : Number(e.target.value))
              }
            />
            {fieldState.error && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    );
  }

  if (q.type === 'short_text') {
    return (
      <Controller
        name={fieldName}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>
              {q.label}
              {q.required && <RequiredAsterisk />}
            </FieldLabel>
            {q.description && <FieldDescription>{q.description}</FieldDescription>}
            <Input
              id={q.id}
              {...field}
              value={(field.value as string) ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              placeholder={q.label}
              maxLength={255}
            />
            {fieldState.error && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    );
  }

  // long_text (default)
  return (
    <Controller
      name={fieldName}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel>
            {q.label}
            {q.required && <RequiredAsterisk />}
          </FieldLabel>
          {q.description && <FieldDescription>{q.description}</FieldDescription>}
          <Textarea
            id={q.id}
            {...field}
            value={(field.value as string) ?? ''}
            onChange={(e) => field.onChange(e.target.value)}
            placeholder={q.label}
            maxLength={2000}
          />
          {fieldState.error && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

type ApplicationFormProps = {
  initial?: Partial<EventOnlyFormValues>;
  applicationQuestions?: ApplicationQuestion[] | null;
  /** Server action (event data, eventId). Use submitEventApplication (fetches profile server-side). */
  submitAction: (
    data: EventOnlyFormValues,
    eventId: string,
  ) => Promise<ActionResult | void>;
  eventId: string;
  submitLabel?: string;
  successMessage?: string;
  errorMessage?: string;
};

const DEFAULT_SUBMIT_LABEL = 'Save Changes';
const DEFAULT_SUCCESS_MESSAGE = 'Application information saved.';
const DEFAULT_ERROR_MESSAGE = 'Failed to save application information.';

function isActionResult(result: ActionResult | void): result is ActionResult {
  return typeof result === 'object' && result !== null && 'success' in result;
}

function ApplicationFormFields({
  control,
  applicationQuestions,
  showSubmit = true,
  isSubmitting = false,
  submitLabel = DEFAULT_SUBMIT_LABEL,
}: {
  control: Control<EventOnlyFormValues>;
  applicationQuestions: ApplicationQuestion[] | null;
  showSubmit?: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
}) {
  const activeQuestions = (applicationQuestions ?? [])
    .filter((q) => q.active)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <FieldGroup className='space-y-4'>
        {activeQuestions.map((q) => (
          <ApplicationQuestionField key={q.id} question={q} control={control} />
        ))}
      </FieldGroup>

      {showSubmit && (
        <div className='mt-6 flex justify-end'>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className='mr-2 size-4 animate-spin' /> Saving…
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      )}
    </>
  );
}

export default function ApplicationForm({
  initial,
  applicationQuestions = null,
  submitAction,
  eventId,
  submitLabel = DEFAULT_SUBMIT_LABEL,
  successMessage = DEFAULT_SUCCESS_MESSAGE,
  errorMessage = DEFAULT_ERROR_MESSAGE,
}: ApplicationFormProps) {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
    reset,
  } = useForm<EventOnlyFormValues>({
    resolver: zodResolver(eventOnlySchema) as Resolver<EventOnlyFormValues>,
    mode: 'onChange',
    reValidateMode: 'onChange',
    criteriaMode: 'firstError',
    defaultValues: {
      applicationResponses: initial?.applicationResponses ?? {},
    },
  });

  React.useEffect(() => {
    reset((currentValues) => ({
      ...currentValues,
      ...initial,
    }));
  }, [initial, reset]);

  const submitHandler = React.useCallback(
    async (eventData: EventOnlyFormValues) => {
      try {
        const result = await submitAction(eventData, eventId);

        if (!result || (isActionResult(result) && result.success)) {
          toast.success(successMessage);
          router.push('/dashboard');
        }

        if (isActionResult(result) && !result.success) {
          toast.error(result.error ?? errorMessage);
        }
      } catch (err) {
        console.error('Application submission error:', err);
        toast.error(errorMessage);
      }
    },
    [submitAction, eventId, successMessage, errorMessage, router],
  );

  return (
    <form onSubmit={handleSubmit(submitHandler)}>
      <ApplicationFormFields
        control={control}
        applicationQuestions={applicationQuestions}
        showSubmit={true}
        isSubmitting={isSubmitting}
        submitLabel={submitLabel}
      />
    </form>
  );
}

export { applicationResponsesSchema, eventOnlySchema } from './schema';
export type { EventOnlyFormValues, ApplicationSelectOption } from './schema';
