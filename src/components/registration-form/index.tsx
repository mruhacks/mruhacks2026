"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { SingleValue, MultiValue } from "react-select";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { type ActionResult } from "@/utils/action-result";

import {
  consentsSchema,
  formSchema,
  interestsSchema,
  personalSchema,
  type RegistrationFormOptions,
  type RegistrationFormValues,
} from "./schema";
import { useRouter } from "next/navigation";

type FormData = RegistrationFormValues;

const tabLabels = {
  personal: "Personal Details",
  interests: "Interests & Preferences",
  consents: "Consents & Finalization",
} as const;
type Tab = keyof typeof tabLabels;

const getSingleValue = (opt: SingleValue<{ value: number; label: string }>) =>
  opt?.value ?? "";
const getMultiValues = (opts: MultiValue<{ value: number; label: string }>) =>
  opts.map((o) => o.value);

function RequiredAsterisk(): React.JSX.Element {
  return <span className="ml-0.5 text-destructive">*</span>;
}

type RegistrationFormProps = {
  initial?: Partial<FormData>;
  options: RegistrationFormOptions;
  onSubmitAction: (data: FormData) => Promise<ActionResult | void>;
  submitLabel?: string;
  successMessage?: string;
  errorMessage?: string;
};

const DEFAULT_SUBMIT_LABEL = "Save Changes";
const DEFAULT_SUCCESS_MESSAGE = "Registration information saved.";
const DEFAULT_ERROR_MESSAGE = "Failed to save registration information.";

function isActionResult(result: ActionResult | void): result is ActionResult {
  return typeof result === "object" && result !== null && "success" in result;
}

export default function RegistrationForm({
  initial,
  options,
  onSubmitAction: onSubmit,
  submitLabel = DEFAULT_SUBMIT_LABEL,
  successMessage = DEFAULT_SUCCESS_MESSAGE,
  errorMessage = DEFAULT_ERROR_MESSAGE,
}: RegistrationFormProps) {
  const router = useRouter();
  const {
    control,
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting, touchedFields, isDirty },
    reset,
    getValues,
  } = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: resolver type mismatch due to pnpm deduping
    resolver: zodResolver(formSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    criteriaMode: "firstError",
    defaultValues: {
      fullName: initial?.fullName ?? "",
      attendedBefore: initial?.attendedBefore ?? false,
      genderId: initial?.genderId,
      universityId: initial?.universityId,
      majorId: initial?.majorId,
      yearOfStudyId: initial?.yearOfStudyId,
      interests: initial?.interests ?? [],
      dietaryRestrictions: initial?.dietaryRestrictions ?? [],
      accommodations: initial?.accommodations ?? "",
      needsParking: initial?.needsParking ?? false,
      heardFromId: initial?.heardFromId,
      consentInfoUse: initial?.consentInfoUse ?? false,
      consentSponsorShare: initial?.consentSponsorShare ?? false,
      consentMediaUse: initial?.consentMediaUse ?? false,
    },
  });

  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  React.useEffect(() => {
    reset((currentValues) => ({
      ...currentValues,
      ...initial,
    }));
  }, [initial, reset]);

  const [tab, setTab] = React.useState<Tab>("personal");
  const tabs = ["personal", "interests", "consents"] as const;

  const accommodations = useWatch({ control, name: "accommodations" }) ?? "";

  const tabSchemas = {
    personal: personalSchema,
    interests: interestsSchema,
    consents: consentsSchema,
  };

  const submitHandler = React.useCallback(
    async (data: FormData) => {
      try {
        const result = await onSubmit(data);

        if (!result || (isActionResult(result) && result.success)) {
          toast.success(successMessage);
          router.push("/dashboard");
        }

        if (!isActionResult(result) || !result.success) {
          toast.error(
            result && "error" in result ? result.error : errorMessage,
          );
        }
      } catch (err) {
        console.error("Registration submission error:", err);
        toast.error(errorMessage);
      }
    },
    [onSubmit, successMessage, errorMessage, router],
  );

  const handleNext = async () => {
    const i = tabs.indexOf(tab);
    if (i === -1 || i === tabs.length - 1) return;

    const schema = tabSchemas[tab];
    const fields = Object.keys(schema.shape) as Array<keyof FormData>;

    console.log(fields);

    console.log(getValues());

    try {
      const isValid = await trigger(fields as (keyof FormData)[], {
        shouldFocus: true,
      });
      if (!isValid) return;
    } catch (e) {
      console.error(e);
    }

    setTab(tabs[i + 1]);

    requestAnimationFrame(() => {
      const nextPanel = document.querySelector(
        `[role="tabpanel"][data-state="active"]`,
      ) as HTMLElement | null;

      if (!nextPanel) return;
      const focusable = nextPanel.querySelector<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable) focusable.focus();
    });
  };

  const tabHasError = (t: Tab) =>
    Object.keys(tabSchemas[t].shape).some(
      (key) => errors[key as keyof FormData],
    );

  return (
    /*eslint-disable-next-line @typescript-eslint/ban-ts-comment */
    /* @ts-ignore: resolver type mismatch due to pnpm deduping */
    <form onSubmit={handleSubmit(submitHandler)}>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="w-full"
      >
        <TabsList className="mb-6 grid w-full grid-cols-3">
          {(Object.keys(tabLabels) as Tab[]).map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className={tabHasError(t) ? "text-destructive underline" : ""}
            >
              {tabLabels[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ───── PERSONAL ───── */}
        <TabsContent value="personal">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="fullName">
                Full Name
                <RequiredAsterisk />
              </FieldLabel>
              <Input
                {...register("fullName")}
                id="fullName"
                placeholder="John Doe"
              />
              {touchedFields.fullName && errors.fullName && (
                <FieldError errors={[errors.fullName]} />
              )}
            </Field>

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

            <Controller
              name="genderId"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    Gender
                    <RequiredAsterisk />
                  </FieldLabel>
                  <Select
                    id="genderId"
                    instanceId="genderId"
                    options={options.genders}
                    value={
                      options.genders.find((o) => o.value === field.value) ??
                      null
                    }
                    onChange={(opt) => field.onChange(getSingleValue(opt))}
                  />
                  {touchedFields.genderId && fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="universityId"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    University / Institution
                    <RequiredAsterisk />
                  </FieldLabel>
                  <Select
                    id="universityId"
                    instanceId="universityId"
                    options={options.universities}
                    value={
                      options.universities.find(
                        (o) => o.value === field.value,
                      ) ?? null
                    }
                    onChange={(opt) => field.onChange(getSingleValue(opt))}
                  />
                  {touchedFields.universityId && fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="majorId"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    Major / Program
                    <RequiredAsterisk />
                  </FieldLabel>
                  <Select
                    id="majorId"
                    instanceId="majorId"
                    options={options.majors}
                    value={
                      options.majors.find((o) => o.value === field.value) ??
                      null
                    }
                    onChange={(opt) => field.onChange(getSingleValue(opt))}
                  />
                  {touchedFields.majorId && fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="yearOfStudyId"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    Year of Study
                    <RequiredAsterisk />
                  </FieldLabel>
                  <Select
                    id="yearOfStudyId"
                    instanceId="yearOfStudyId"
                    options={options.years}
                    value={
                      options.years.find((o) => o.value === field.value) ?? null
                    }
                    onChange={(opt) => field.onChange(getSingleValue(opt))}
                  />
                  {touchedFields.yearOfStudyId && fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>

          <div className="mt-6 flex justify-end">
            <Button type="button" onClick={handleNext}>
              Next
            </Button>
          </div>
        </TabsContent>

        {/* ───── INTERESTS ───── */}
        <TabsContent value="interests">
          <FieldGroup>
            <Controller
              name="interests"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    Interests
                    <RequiredAsterisk />
                  </FieldLabel>
                  <Select
                    id="interests"
                    instanceId="interests"
                    isMulti
                    options={options.interests}
                    value={options.interests.filter((o) =>
                      field.value.includes(o.value),
                    )}
                    onChange={(opts) => field.onChange(getMultiValues(opts))}
                  />
                  {touchedFields.interests && fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="dietaryRestrictions"
              control={control}
              render={({ field }) => (
                <Field>
                  <FieldLabel>Dietary Restrictions</FieldLabel>
                  <Select
                    id="dietaryRestrictions"
                    instanceId="dietaryRestrictions"
                    isMulti
                    options={options.dietary}
                    value={options.dietary.filter((o) =>
                      field.value.includes(o.value),
                    )}
                    onChange={(opts) => field.onChange(getMultiValues(opts))}
                  />
                </Field>
              )}
            />

            <Field>
              <FieldLabel>Special Accommodations</FieldLabel>
              <Textarea
                id="accommodations"
                {...register("accommodations")}
                placeholder="Please let us know if you have any special needs."
                maxLength={500}
              />
              <p className="mt-1 text-right text-sm text-muted-foreground">
                {accommodations.length}/500 characters
              </p>
            </Field>
          </FieldGroup>

          <div className="mt-6 flex justify-end">
            <Button type="button" onClick={handleNext}>
              Next
            </Button>
          </div>
        </TabsContent>

        {/* ───── CONSENTS ───── */}
        <TabsContent value="consents">
          <FieldGroup className="space-y-4">
            <Controller
              name="needsParking"
              control={control}
              render={({ field }) => (
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="needsParking"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="needsParking">
                    I will require parking for the event
                  </Label>
                </div>
              )}
            />

            <Controller
              name="heardFromId"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    How did you hear about us?
                    <RequiredAsterisk />
                  </FieldLabel>
                  <Select
                    id="heardFromId"
                    instanceId="heardFromId"
                    options={options.heardFrom}
                    value={
                      options.heardFrom.find((o) => o.value === field.value) ??
                      null
                    }
                    onChange={(opt) => field.onChange(getSingleValue(opt))}
                  />
                  {touchedFields.heardFromId && fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {[
              {
                name: "consentInfoUse",
                label:
                  "I agree that MRUHacks may use my information for event organization",
                desc: "This includes communication, scheduling, and logistics.",
              },
              {
                name: "consentSponsorShare",
                label: "I agree to share my information with event sponsors",
                desc: "Sponsors may contact you for networking or recruitment.",
              },
              {
                name: "consentMediaUse",
                label: "I agree to appear in event photos or videos",
                desc: "These may be used for MRUHacks promotion and documentation.",
              },
            ].map(({ name, label, desc }) => (
              <Controller
                key={name}
                name={name as keyof FormData}
                control={control}
                render={({ field, fieldState }) => (
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={name}
                      checked={field.value as boolean}
                      onCheckedChange={field.onChange}
                    />
                    <div className="grid gap-2">
                      <Label htmlFor={name}>
                        <span
                          className={
                            fieldState.invalid
                              ? "text-destructive underline"
                              : ""
                          }
                        >
                          {label}
                        </span>
                        <RequiredAsterisk />
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {desc}
                        <FieldError errors={[fieldState.error]} />
                      </p>
                    </div>
                  </div>
                )}
              />
            ))}
          </FieldGroup>

          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Saving…
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </form>
  );
}

export {
  consentsSchema,
  formSchema,
  interestsSchema,
  personalSchema,
} from "./schema";
export type {
  RegistrationFormOptions,
  RegistrationFormValues,
  RegistrationSelectOption,
} from "./schema";
