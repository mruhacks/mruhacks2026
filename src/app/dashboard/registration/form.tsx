"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { SingleValue, MultiValue } from "react-select";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
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
import { OPTIONS } from "./options";

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────

function RequiredAsterisk() {
  return <span className="text-destructive ml-0.5">*</span>;
}

const getSingleValue = (opt: SingleValue<{ value: string; label: string }>) =>
  opt?.value ?? "";
const getMultiValues = (opts: MultiValue<{ value: string; label: string }>) =>
  opts.map((o) => o.value);

// ───────────────────────────────────────────────
// Schema setup
// ───────────────────────────────────────────────

const personalSchema = z.object({
  fullName: z.string().trim().min(1, "Required"),
  attendedBefore: z.boolean(),
  gender: z.string().min(1, "Required"),
  university: z.string().min(1, "Required"),
  major: z.string().min(1, "Required"),
  yearOfStudy: z.number().int().min(1, "Required").max(5),
});

const interestsSchema = z.object({
  interests: z.array(z.string()).nonempty("Select at least one interest."),
  dietaryRestrictions: z.array(z.string()),
  accommodations: z.string().max(500).optional(),
});

const consentsSchema = z.object({
  needsParking: z.boolean(),
  heardFrom: z.string().min(1, "Required"),
  consentInfoUse: z
    .boolean()
    .refine((v) => v === true, { message: "Required" }),
  consentSponsorShare: z
    .boolean()
    .refine((v) => v === true, { message: "Required" }),
  consentMediaUse: z
    .boolean()
    .refine((v) => v === true, { message: "Required" }),
});

const formSchema = personalSchema.merge(interestsSchema).merge(consentsSchema);
type FormData = z.infer<typeof formSchema>;

// ───────────────────────────────────────────────
// Tabs setup
// ───────────────────────────────────────────────

const tabLabels = {
  personal: "Personal Details",
  interests: "Interests & Preferences",
  consents: "Consents & Finalization",
} as const;
type Tab = keyof typeof tabLabels;

export default function RegistrationForm({
  initial,
}: {
  initial?: Partial<FormData>;
}) {
  const {
    control,
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    criteriaMode: "firstError",
    defaultValues: {
      fullName: initial?.fullName ?? "",
      attendedBefore: initial?.attendedBefore ?? false,
      gender: initial?.gender ?? "",
      university: initial?.university ?? "",
      major: initial?.major ?? "",
      yearOfStudy: initial?.yearOfStudy ?? 0,
      interests: initial?.interests ?? [],
      dietaryRestrictions: initial?.dietaryRestrictions ?? [],
      accommodations: initial?.accommodations ?? "",
      needsParking: initial?.needsParking ?? false,
      heardFrom: initial?.heardFrom ?? "",
      consentInfoUse: initial?.consentInfoUse ?? false,
      consentSponsorShare: initial?.consentSponsorShare ?? false,
      consentMediaUse: initial?.consentMediaUse ?? false,
    },
  });

  const [tab, setTab] = React.useState<Tab>("personal");
  const tabs = ["personal", "interests", "consents"] as const;

  const accommodations = useWatch({ control, name: "accommodations" }) ?? "";

  const tabSchemas = {
    personal: personalSchema,
    interests: interestsSchema,
    consents: consentsSchema,
  };

  const onSubmit = async (data: FormData) => {
    toast.success("Registration information saved.");
    console.log(data);
  };

  const handleNext = async () => {
    const i = tabs.indexOf(tab);
    if (i === -1 || i === tabs.length - 1) return;

    const schema = tabSchemas[tab];
    const fields = Object.keys(schema.shape) as (keyof FormData)[];

    // validate only current tab fields
    const isValid = await trigger(fields, { shouldFocus: true });
    if (!isValid) return;

    setTab(tabs[i + 1]);

    /** Move focus into the next input */
    requestAnimationFrame(() => {
      const nextPanel = document.querySelector(
        `[role="tabpanel"][data-state="active"]`,
      ) as HTMLElement | null;

      if (!nextPanel) return;
      const focusable = nextPanel.querySelector<HTMLElement>(
        'input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable) focusable.focus();
    });
  };

  const tabHasError = (t: Tab) =>
    Object.keys(tabSchemas[t].shape).some(
      (key) => errors[key as keyof FormData],
    );

  return (
    <Card className="w-full sm:max-w-2xl">
      <CardHeader>
        <CardTitle>Registration Information</CardTitle>
        <CardDescription>Update your registration information.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="w-full"
          >
            <TabsList className="grid grid-cols-3 mb-6 w-full">
              {(Object.keys(tabLabels) as Tab[]).map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  className={
                    tabHasError(t) && tab !== t ? " text-destructive" : ""
                  }
                >
                  {tabLabels[t]}
                  {tabHasError(t) && tab !== t && (
                    <span className="ml-0.5 text-destructive">*</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ───── PERSONAL ───── */}
            <TabsContent value="personal">
              <FieldGroup>
                <Field>
                  <FieldLabel>
                    Full Name
                    <RequiredAsterisk />
                  </FieldLabel>
                  <Input {...register("fullName")} id="fullName" />
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
                  name="gender"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>
                        Gender
                        <RequiredAsterisk />
                      </FieldLabel>
                      <Select
                        id="gender"
                        instanceId="gender"
                        options={OPTIONS.genders}
                        value={
                          OPTIONS.genders.find(
                            (o) => o.value === field.value,
                          ) ?? null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            getSingleValue(opt as SingleValue<any>),
                          )
                        }
                      />
                      {touchedFields.gender && fieldState.error && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="university"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>
                        University / Institution
                        <RequiredAsterisk />
                      </FieldLabel>
                      <Select
                        id="university"
                        instanceId="university"
                        options={OPTIONS.universities}
                        value={
                          OPTIONS.universities.find(
                            (o) => o.value === field.value,
                          ) ?? null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            getSingleValue(opt as SingleValue<any>),
                          )
                        }
                      />
                      {touchedFields.university && fieldState.error && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="major"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>
                        Major / Program
                        <RequiredAsterisk />
                      </FieldLabel>
                      <Select
                        id="major"
                        instanceId="major"
                        options={OPTIONS.majors}
                        value={
                          OPTIONS.majors.find((o) => o.value === field.value) ??
                          null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            getSingleValue(opt as SingleValue<any>),
                          )
                        }
                      />
                      {touchedFields.major && fieldState.error && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="yearOfStudy"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>
                        Year of Study
                        <RequiredAsterisk />
                      </FieldLabel>
                      <Select
                        id="yearOfStudy"
                        instanceId="yearOfStudy"
                        options={OPTIONS.years}
                        value={
                          OPTIONS.years.find((o) => o.value === field.value) ??
                          null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            Number(getSingleValue(opt as SingleValue<any>)),
                          )
                        }
                      />
                      {touchedFields.yearOfStudy && fieldState.error && (
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
                        options={OPTIONS.interests}
                        value={OPTIONS.interests.filter((o) =>
                          field.value.includes(o.value),
                        )}
                        onChange={(opts) =>
                          field.onChange(
                            getMultiValues(opts as MultiValue<any>),
                          )
                        }
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
                        options={OPTIONS.dietary}
                        value={OPTIONS.dietary.filter((o) =>
                          field.value.includes(o.value),
                        )}
                        onChange={(opts) =>
                          field.onChange(
                            getMultiValues(opts as MultiValue<any>),
                          )
                        }
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
                  <p className="text-sm text-muted-foreground text-right mt-1">
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
                  name="heardFrom"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>
                        How did you hear about us?
                        <RequiredAsterisk />
                      </FieldLabel>
                      <Select
                        id="heardFrom"
                        instanceId="heardFrom"
                        options={OPTIONS.heardFrom}
                        value={
                          OPTIONS.heardFrom.find(
                            (o) => o.value === field.value,
                          ) ?? null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            getSingleValue(opt as SingleValue<any>),
                          )
                        }
                      />
                      {touchedFields.heardFrom && fieldState.error && (
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
                    label:
                      "I agree to share my information with event sponsors",
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
                    render={({ field }) => (
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={name}
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <div className="grid gap-2">
                          <Label htmlFor={name}>
                            {label}
                            <RequiredAsterisk />
                          </Label>
                          <p className="text-muted-foreground text-sm">
                            {desc}
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
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </form>
      </CardContent>
    </Card>
  );
}
