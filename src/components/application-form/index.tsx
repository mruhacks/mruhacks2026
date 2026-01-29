"use client";

import * as React from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { SingleValue } from "react-select";

import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { type ActionResult } from "@/utils/action-result";

import {
  eventOnlySchema,
  type ApplicationFormOptions,
  type EventOnlyFormValues,
} from "./schema";
import type { ApplicationQuestion } from "@/types/application";
import { APPLICATION_QUESTION_OPTIONS_MAP } from "@/types/application";
import { useRouter } from "next/navigation";

function RequiredAsterisk(): React.JSX.Element {
  return <span className="text-destructive ml-0.5">*</span>;
}

type ApplicationFormProps = {
  initial?: Partial<EventOnlyFormValues>;
  options: ApplicationFormOptions;
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

const DEFAULT_SUBMIT_LABEL = "Save Changes";
const DEFAULT_SUCCESS_MESSAGE = "Application information saved.";
const DEFAULT_ERROR_MESSAGE = "Failed to save application information.";

function isActionResult(result: ActionResult | void): result is ActionResult {
  return typeof result === "object" && result !== null && "success" in result;
}

export default function ApplicationForm({
  initial,
  options,
  applicationQuestions = null,
  submitAction,
  eventId,
  submitLabel = DEFAULT_SUBMIT_LABEL,
  successMessage = DEFAULT_SUCCESS_MESSAGE,
  errorMessage = DEFAULT_ERROR_MESSAGE,
}: ApplicationFormProps) {
  const hasEventQuestions =
    Array.isArray(applicationQuestions) && applicationQuestions.length > 0;
  const router = useRouter();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<EventOnlyFormValues>({
    resolver: zodResolver(eventOnlySchema) as Resolver<EventOnlyFormValues>,
    mode: "onChange",
    reValidateMode: "onChange",
    criteriaMode: "firstError",
    defaultValues: {
      attendedBefore: initial?.attendedBefore ?? false,
      accommodations: initial?.accommodations ?? "",
      applicationResponses: initial?.applicationResponses ?? {},
    },
  });

  React.useEffect(() => {
    reset((currentValues) => ({
      ...currentValues,
      ...initial,
    }));
  }, [initial, reset]);

  const accommodations = useWatch({ control, name: "accommodations" }) ?? "";

  const submitHandler = React.useCallback(
    async (eventData: EventOnlyFormValues) => {
      try {
        const result = await submitAction(eventData, eventId);

        if (!result || (isActionResult(result) && result.success)) {
          toast.success(successMessage);
          router.push("/dashboard");
        }

        if (isActionResult(result) && !result.success) {
          toast.error(result.error ?? errorMessage);
        }
      } catch (err) {
        console.error("Application submission error:", err);
        toast.error(errorMessage);
      }
    },
    [submitAction, eventId, successMessage, errorMessage, router],
  );

  return (
    <form onSubmit={handleSubmit(submitHandler)}>
      <FieldGroup className="space-y-4">
        <Controller
          name="attendedBefore"
          control={control}
          render={({ field }) => (
            <div className="flex items-start gap-3">
              <Checkbox
                id="attendedBefore"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <div className="grid gap-2">
                <Label htmlFor="attendedBefore">
                  I have attended MRUHacks before
                </Label>
              </div>
            </div>
          )}
        />

        <Field>
          <FieldLabel>Special Accommodations</FieldLabel>
          <Controller
            name="accommodations"
            control={control}
            render={({ field }) => (
              <Textarea
                id="accommodations"
                {...field}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder="Please let us know if you have any special needs."
                maxLength={500}
              />
            )}
          />
          <p className="text-sm text-muted-foreground text-right mt-1">
            {String(accommodations).length}/500 characters
          </p>
        </Field>

        {hasEventQuestions &&
          applicationQuestions!.map((q) => {
            const fieldName =
              `applicationResponses.${q.key}` as keyof EventOnlyFormValues;
            const optionsKey = APPLICATION_QUESTION_OPTIONS_MAP[q.key];
            const selectOptions = q.options?.length
              ? q.options.map((o) => ({
                  value: o.value as number,
                  label: o.label,
                }))
              : optionsKey
                ? (options[optionsKey as keyof typeof options] as {
                    value: number;
                    label: string;
                  }[])
                : [];

            if (q.type === "boolean") {
              return (
                <Controller
                  key={q.key}
                  name={
                    fieldName as `applicationResponses.${string}` as keyof EventOnlyFormValues
                  }
                  control={control}
                  defaultValue={undefined}
                  render={({ field }) => (
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={q.key}
                        checked={Boolean(field.value)}
                        onCheckedChange={field.onChange}
                      />
                      <Label htmlFor={q.key}>
                        {q.label ?? q.key}
                        {q.required && <RequiredAsterisk />}
                      </Label>
                    </div>
                  )}
                />
              );
            }

            if (q.type === "select") {
              return (
                <Controller
                  key={q.key}
                  name={
                    fieldName as `applicationResponses.${string}` as keyof EventOnlyFormValues
                  }
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>
                        {q.label ?? q.key}
                        {q.required && <RequiredAsterisk />}
                      </FieldLabel>
                      <Select
                        id={q.key}
                        instanceId={`app-q-${q.key}`}
                        options={selectOptions}
                        value={
                          selectOptions.find(
                            (o) =>
                              o.value === (field.value as unknown as number),
                          ) ?? null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            (opt as SingleValue<{
                              value: number;
                              label: string;
                            }>)?.value ?? null,
                          )
                        }
                      />
                      {fieldState.error && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              );
            }

            return (
              <Controller
                key={q.key}
                name={
                  fieldName as `applicationResponses.${string}` as keyof EventOnlyFormValues
                }
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>
                      {q.label ?? q.key}
                      {q.required && <RequiredAsterisk />}
                    </FieldLabel>
                    <Textarea
                      id={q.key}
                      {...field}
                      value={(field.value as string) ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder={q.label ?? q.key}
                      maxLength={500}
                    />
                    {fieldState.error && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            );
          })}
      </FieldGroup>

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}

export {
  applicationResponsesSchema,
  eventOnlySchema,
} from "./schema";
export type {
  EventOnlyFormValues,
  ApplicationFormOptions,
  ApplicationSelectOption,
} from "./schema";
