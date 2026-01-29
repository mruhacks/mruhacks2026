"use client";

import * as React from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
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
import { Select } from "@/components/select";
import { type ActionResult } from "@/utils/action-result";

import {
  profileFormSchema,
  interestsSchema,
  personalSchema,
  type ProfileFormValues,
} from "@/components/profile-form/schema";
import { type ApplicationFormOptions } from "@/components/application-form/schema";
import { useRouter } from "next/navigation";

const tabLabels: Record<string, string> = {
  personal: "Personal Details",
  interests: "Interests & Preferences",
};

const getSingleValue = (opt: SingleValue<{ value: number; label: string }>) =>
  opt?.value ?? "";
const getMultiValues = (opts: MultiValue<{ value: number; label: string }>) =>
  opts.map((o) => o.value);

function RequiredAsterisk(): React.JSX.Element {
  return <span className="text-destructive ml-0.5">*</span>;
}

type ProfileFormProps = {
  initial?: Partial<ProfileFormValues>;
  options: ApplicationFormOptions;
  onSubmit: (data: ProfileFormValues) => Promise<ActionResult | void>;
  submitLabel?: string;
  successMessage?: string;
  errorMessage?: string;
};

const DEFAULT_SUBMIT_LABEL = "Save Changes";
const DEFAULT_SUCCESS_MESSAGE = "Profile saved successfully.";
const DEFAULT_ERROR_MESSAGE = "Failed to save profile.";

function isActionResult(result: ActionResult | void): result is ActionResult {
  return typeof result === "object" && result !== null && "success" in result;
}

export default function ProfileForm({
  initial,
  options,
  onSubmit,
  submitLabel = DEFAULT_SUBMIT_LABEL,
  successMessage = DEFAULT_SUCCESS_MESSAGE,
  errorMessage = DEFAULT_ERROR_MESSAGE,
}: ProfileFormProps) {
  const router = useRouter();
  const {
    control,
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting, touchedFields },
    reset,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema) as Resolver<ProfileFormValues>,
    mode: "onChange",
    reValidateMode: "onChange",
    criteriaMode: "firstError",
    defaultValues: {
      fullName: initial?.fullName ?? "",
      genderId: initial?.genderId,
      universityId: initial?.universityId,
      majorId: initial?.majorId,
      yearOfStudyId: initial?.yearOfStudyId,
      interests: initial?.interests ?? [],
      dietaryRestrictions: initial?.dietaryRestrictions ?? [],
    },
  });

  React.useEffect(() => {
    reset((currentValues) => ({
      ...currentValues,
      ...initial,
    }));
  }, [initial, reset]);

  const [tab, setTab] = React.useState<"personal" | "interests">("personal");

  const tabSchemas: Record<string, { shape: Record<string, unknown> }> = {
    personal: personalSchema,
    interests: interestsSchema,
  };

  const submitHandler = React.useCallback(
    async (data: ProfileFormValues) => {
      try {
        const result = await onSubmit(data);

        if (!result || (isActionResult(result) && result.success)) {
          toast.success(successMessage);
          router.push("/dashboard");
        }

        if (isActionResult(result) && !result.success) {
          toast.error(result.error ?? errorMessage);
        }
      } catch (err) {
        console.error("Profile submission error:", err);
        toast.error(errorMessage);
      }
    },
    [onSubmit, successMessage, errorMessage, router],
  );

  const handleNext = async () => {
    const schema = tabSchemas[tab];
    const fields = Object.keys(schema.shape) as Array<keyof ProfileFormValues>;

    try {
      const isValid = await trigger(fields, { shouldFocus: true });
      if (!isValid) return;
    } catch (e) {
      console.error(e);
    }

    setTab("interests");

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

  const tabHasError = (t: "personal" | "interests") =>
    Object.keys(tabSchemas[t].shape).some(
      (key) => errors[key as keyof ProfileFormValues],
    );

  return (
    <form onSubmit={handleSubmit(submitHandler)}>
    <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "personal" | "interests")}
        className="w-full"
      >
        <TabsList className="grid mb-6 w-full grid-cols-2">
          <TabsTrigger
            value="personal"
            className={tabHasError("personal") ? " text-destructive underline" : ""}
          >
            {tabLabels.personal}
          </TabsTrigger>
          <TabsTrigger
            value="interests"
            className={tabHasError("interests") ? " text-destructive underline" : ""}
          >
            {tabLabels.interests}
          </TabsTrigger>
        </TabsList>

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
                      options.years.find((o) => o.value === field.value) ??
                      null
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
        </TabsContent>
      </Tabs>
    </form>
  );
}
