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
import { OPTIONS } from "./options";

// ───────────────────────────────────────────────
// Schema + Types
// ───────────────────────────────────────────────

type OptionType = { value: string; label: string };

const formSchema = z.object({
  firstName: z.string().trim().min(1, "Required"),
  lastName: z.string().trim().min(1, "Required"),
  attendedBefore: z.boolean(),
  gender: z.string().min(1, "Required"),
  university: z.string().min(1, "Required"),
  major: z.string().min(1, "Required"),
  yearOfStudy: z.number().int().min(1, "Required").max(5),

  interests: z.array(z.string()).nonempty("Select at least one interest."),
  dietaryRestrictions: z.array(z.string()),
  accommodations: z.string().max(500).optional(),

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

export type FormData = z.infer<typeof formSchema>;

// ───────────────────────────────────────────────
// Utility
// ───────────────────────────────────────────────

function getSingleValue(opt: SingleValue<OptionType>): string {
  return opt?.value ?? "";
}
function getMultiValues(opts: MultiValue<OptionType>): string[] {
  return opts.map((o) => o.value);
}

// ───────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────

export default function RegistrationForm({
  initial,
}: {
  initial?: Partial<FormData>;
}) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: initial?.firstName ?? "",
      lastName: initial?.lastName ?? "",
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

  const accommodations = useWatch({ control, name: "accommodations" }) ?? "";
  const interests = useWatch({ control, name: "interests" }) ?? [];
  const [tab, setTab] = React.useState("personal");

  const onSubmit = async (data: FormData) => {
    toast.success("Registration information saved.");
    console.log(data);
  };

  return (
    <Card className="w-full sm:max-w-2xl">
      <CardHeader>
        <CardTitle>Registration Information</CardTitle>
        <CardDescription>Update your registration information.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid grid-cols-3 mb-6">
              <TabsTrigger value="personal">Personal Details</TabsTrigger>
              <TabsTrigger value="interests">
                Interests & Preferences
              </TabsTrigger>
              <TabsTrigger value="consents">
                Consents & Finalization
              </TabsTrigger>
            </TabsList>

            <TabsContent value="personal">
              <FieldGroup>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel>First Name*</FieldLabel>
                    <Input {...register("firstName")} />
                    {errors.firstName && (
                      <FieldError errors={[errors.firstName]} />
                    )}
                  </Field>

                  <Field>
                    <FieldLabel>Last Name*</FieldLabel>
                    <Input {...register("lastName")} />
                    {errors.lastName && (
                      <FieldError errors={[errors.lastName]} />
                    )}
                  </Field>
                </div>

                <Field>
                  <FieldLabel>Have you attended MRUHacks before?*</FieldLabel>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      {...register("attendedBefore")}
                      className="accent-primary"
                    />
                    Yes
                  </label>
                </Field>

                <Controller
                  name="gender"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Gender*</FieldLabel>
                      <Select
                        instanceId="gender"
                        options={OPTIONS.genders}
                        value={
                          OPTIONS.genders.find(
                            (o) => o.value === field.value,
                          ) ?? null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            getSingleValue(opt as SingleValue<OptionType>),
                          )
                        }
                      />
                      {fieldState.error && (
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
                      <FieldLabel>University / Institution*</FieldLabel>
                      <Select
                        options={OPTIONS.universities}
                        value={
                          OPTIONS.universities.find(
                            (o) => o.value === field.value,
                          ) ?? null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            getSingleValue(opt as SingleValue<OptionType>),
                          )
                        }
                      />
                      {fieldState.error && (
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
                      <FieldLabel>Major / Program*</FieldLabel>
                      <Select
                        options={OPTIONS.majors}
                        value={
                          OPTIONS.majors.find((o) => o.value === field.value) ??
                          null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            getSingleValue(opt as SingleValue<OptionType>),
                          )
                        }
                      />
                      {fieldState.error && (
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
                        What year will you be in as of Fall?*
                      </FieldLabel>
                      <Select
                        options={OPTIONS.years}
                        value={
                          OPTIONS.years.find((o) => o.value === field.value) ??
                          null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            Number(
                              getSingleValue(opt as SingleValue<OptionType>),
                            ),
                          )
                        }
                      />
                      {fieldState.error && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </TabsContent>

            {/* ──────── INTERESTS & PREFERENCES ──────── */}
            <TabsContent value="interests">
              <FieldGroup>
                <Controller
                  name="interests"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Interests*</FieldLabel>
                      <Select
                        isMulti
                        options={OPTIONS.interests}
                        value={OPTIONS.interests.filter((o) =>
                          field.value.includes(o.value),
                        )}
                        onChange={(opts) =>
                          field.onChange(
                            getMultiValues(opts as MultiValue<OptionType>),
                          )
                        }
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        {interests.length} selected
                      </p>
                      {fieldState.error && (
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
                        isMulti
                        options={OPTIONS.dietary}
                        value={OPTIONS.dietary.filter((o) =>
                          field.value.includes(o.value),
                        )}
                        onChange={(opts) =>
                          field.onChange(
                            getMultiValues(opts as MultiValue<OptionType>),
                          )
                        }
                      />
                    </Field>
                  )}
                />

                <Field>
                  <FieldLabel>Special Accommodations</FieldLabel>
                  <Textarea
                    {...register("accommodations")}
                    placeholder="Please let us know if you have any special accommodation needs for the event."
                    maxLength={500}
                  />
                  <p className="text-sm text-muted-foreground text-right mt-1">
                    {accommodations.length}/500 characters
                  </p>
                </Field>
              </FieldGroup>
            </TabsContent>

            {/* ──────── CONSENTS & FINALIZATION ──────── */}
            <TabsContent value="consents">
              <FieldGroup>
                <Controller
                  name="needsParking"
                  control={control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>Will you require parking?*</FieldLabel>
                      <label className="flex items-center gap-2 mt-1">
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={() => field.onChange(!field.value)}
                        />
                        Yes
                      </label>
                    </Field>
                  )}
                />

                <Controller
                  name="heardFrom"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>How did you hear about us?*</FieldLabel>
                      <Select
                        options={OPTIONS.heardFrom}
                        value={
                          OPTIONS.heardFrom.find(
                            (o) => o.value === field.value,
                          ) ?? null
                        }
                        onChange={(opt) =>
                          field.onChange(
                            getSingleValue(opt as SingleValue<OptionType>),
                          )
                        }
                      />
                      {fieldState.error && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <h3 className="text-lg font-medium mt-4 mb-2">
                  Final Acknowledgments
                </h3>

                {[
                  {
                    name: "consentInfoUse" as const,
                    label:
                      "I give permission to MRUHacks to use my information for the purpose of the event*",
                    desc: "This includes event logistics, communication, and administration purposes.",
                  },
                  {
                    name: "consentSponsorShare" as const,
                    label:
                      "I give my permission to MRUHacks to share my information with our sponsors*",
                    desc: "Your information may be shared with event sponsors for recruitment and networking opportunities.",
                  },
                  {
                    name: "consentMediaUse" as const,
                    label:
                      "I consent to the use of my likeness in photographs, videos, and other media for promotional purposes*",
                    desc: "Media may be used for social media, marketing materials, and event documentation.",
                  },
                ].map(({ name, label, desc }) => (
                  <Controller
                    key={name}
                    name={name}
                    control={control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={() => field.onChange(!field.value)}
                          />
                          <span>
                            <strong>{label}</strong>
                            <br />
                            <span className="text-sm text-muted-foreground">
                              {desc}
                            </span>
                          </span>
                        </label>
                        {fieldState.error && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
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
