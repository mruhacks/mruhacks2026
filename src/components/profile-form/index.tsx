'use client';

import * as React from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { SingleValue, MultiValue } from 'react-select';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldError,
  RequiredAsterisk,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/select';
import { isOtherOption } from '@/lib/other-option';
import { type ActionResult } from '@/utils/action-result';
import { ProfileAssets } from '@/app/dashboard/profile/profile-assets';
import { uploadResume } from '@/app/dashboard/profile/actions';

import {
  profileFormOptionalAboutSchema,
  profileFormSchema,
  type ProfileFormInput,
} from '@/components/profile-form/schema';
import { type ProfileFormOptions } from '@/components/profile-form/schema';

// Mirrors the welcome onboarding flow's step categories (Personal / About you).
const tabLabels: Record<string, string> = {
  personal: 'Personal',
  about: 'About you',
};

/** A tab beside Personal / About you that saves on its own (its own form). */
export type ProfileFormExtraTab = {
  value: string;
  label: string;
  content: React.ReactNode;
};

const PERSONAL_FIELDS = [
  'fullName',
  'genderId',
  'dietaryRestrictions',
  'linkedinUrl',
] as const;
const ABOUT_FIELDS = ['universityId', 'majorId', 'yearOfStudyId'] as const;

const getSingleValue = (opt: SingleValue<{ value: number; label: string }>) =>
  opt?.value ?? '';
const getMultiValues = (opts: MultiValue<{ value: number; label: string }>) =>
  opts.map((o) => o.value);

type ProfileFormProps = {
  initial?: Partial<ProfileFormInput>;
  options: ProfileFormOptions;
  onSubmit: (data: ProfileFormInput) => Promise<ActionResult | void>;
  /**
   * The About you half may be left blank (all-or-nothing) — for judges, who
   * onboard without it. The server applies the same rule on its own.
   */
  aboutOptional?: boolean;
  submitLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  /** Called after a successful save. */
  onSuccess?: () => void;
  /**
   * Where to go after a successful save (e.g. back to the event application
   * that sent the user here). Must already be a sanitized same-origin path.
   */
  successHref?: string;
  /** Resume upload state, shown in the About you tab. */
  hasResume: boolean;
  resumeFileName: string | null;
  /** Renames the About you tab (e.g. "Student profile" beside a professional one). */
  aboutLabel?: string;
  /** Rendered as a third tab, outside this form so it can hold its own. */
  extraTab?: ProfileFormExtraTab;
  /** Which tab opens first; defaults to Personal. */
  defaultTab?: string;
};

const DEFAULT_SUBMIT_LABEL = 'Save Changes';
const DEFAULT_SUCCESS_MESSAGE = 'Profile saved successfully.';
const DEFAULT_ERROR_MESSAGE = 'Failed to save profile.';

function isActionResult(result: ActionResult | void): result is ActionResult {
  return typeof result === 'object' && result !== null && 'success' in result;
}

export default function ProfileForm({
  initial,
  options,
  onSubmit,
  submitLabel = DEFAULT_SUBMIT_LABEL,
  successMessage = DEFAULT_SUCCESS_MESSAGE,
  errorMessage = DEFAULT_ERROR_MESSAGE,
  onSuccess,
  successHref,
  aboutOptional = false,
  hasResume,
  resumeFileName,
  aboutLabel = tabLabels.about,
  extraTab,
  defaultTab = 'personal',
}: ProfileFormProps) {
  const router = useRouter();
  const {
    control,
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ProfileFormInput>({
    resolver: zodResolver(
      aboutOptional ? profileFormOptionalAboutSchema : profileFormSchema,
    ) as Resolver<ProfileFormInput>,
    mode: 'onChange',
    reValidateMode: 'onChange',
    criteriaMode: 'firstError',
    defaultValues: {
      fullName: initial?.fullName ?? '',
      genderId: initial?.genderId,
      genderOtherText: initial?.genderOtherText ?? '',
      universityId: initial?.universityId,
      universityOtherText: initial?.universityOtherText ?? '',
      majorId: initial?.majorId,
      majorOtherText: initial?.majorOtherText ?? '',
      yearOfStudyId: initial?.yearOfStudyId,
      dietaryRestrictions: initial?.dietaryRestrictions ?? [],
      dietaryOtherText: initial?.dietaryOtherText ?? '',
      linkedinUrl: initial?.linkedinUrl ?? '',
      githubUrl: initial?.githubUrl ?? '',
    },
  });

  React.useEffect(() => {
    reset((currentValues) => ({
      ...currentValues,
      ...initial,
    }));
  }, [initial, reset]);

  const [tab, setTab] = React.useState(defaultTab);
  const [queuedResume, setQueuedResume] = React.useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = React.useState(false);
  const [dietaryNoneSelected, setDietaryNoneSelected] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string>();
  const formRef = React.useRef<HTMLFormElement>(null);

  const submitHandler = React.useCallback(
    async (data: ProfileFormInput) => {
      setSubmitError(undefined);
      try {
        const result = await onSubmit(data);

        if (isActionResult(result) && !result.success) {
          setSubmitError(result.error ?? errorMessage);
          return;
        }

        // The resume can only be attached once the profile row exists, so
        // it's queued client-side on selection and uploaded here, right
        // after the profile save succeeds.
        if (queuedResume) {
          setUploadingResume(true);
          const formData = new FormData();
          formData.set('resume', queuedResume);
          const uploadResult = await uploadResume(formData);
          setUploadingResume(false);
          if (!uploadResult.success) {
            setSubmitError(uploadResult.error ?? 'Failed to upload resume.');
            return;
          }
          setQueuedResume(null);
        }

        toast.success(successMessage);
        if (onSuccess) {
          onSuccess();
        }
        if (successHref) {
          router.push(successHref);
        }
      } catch (err) {
        console.error('[profile-form] submission failed', err);
        toast.error(errorMessage);
      }
    },
    [
      onSubmit,
      successMessage,
      errorMessage,
      onSuccess,
      successHref,
      router,
      queuedResume,
    ],
  );

  const focusActiveSection = () => {
    requestAnimationFrame(() => {
      // Scoped to this form: the extra tab's panel sits outside it.
      const nextPanel = formRef.current?.querySelector<HTMLElement>(
        `[role="tabpanel"][data-state="active"]`,
      );
      const focusable = nextPanel?.querySelector<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    });
  };

  const handleNext = async () => {
    try {
      const isValid = await trigger([...PERSONAL_FIELDS], {
        shouldFocus: true,
      });
      if (!isValid) return;
    } catch (e) {
      console.error('[profile-form] failed to validate personal fields', e);
    }

    setTab('about');
    focusActiveSection();
  };

  const tabHasError = (fields: readonly (keyof ProfileFormInput)[]) =>
    fields.some((key) => errors[key]);

  const personalFields = (
    <>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor='fullName'>
            Full Name
            <RequiredAsterisk />
          </FieldLabel>
          <Input
            {...register('fullName')}
            id='fullName'
            placeholder='John Doe'
          />
          {errors.fullName && <FieldError errors={[errors.fullName]} />}
        </Field>

        <Controller
          name='genderId'
          control={control}
          render={({ field, fieldState }) => {
            const selected = options.genders.find(
              (o) => o.value === field.value,
            );
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>
                  Gender
                  <RequiredAsterisk />
                </FieldLabel>
                <Select
                  id='genderId'
                  instanceId='genderId'
                  options={options.genders}
                  value={selected ?? null}
                  onChange={(opt) => field.onChange(getSingleValue(opt))}
                />
                {fieldState.error && <FieldError errors={[fieldState.error]} />}
                {isOtherOption(selected?.label) && (
                  <Input
                    {...register('genderOtherText')}
                    placeholder='Please specify'
                    aria-label='Specify gender'
                  />
                )}
              </Field>
            );
          }}
        />

        <Controller
          name='dietaryRestrictions'
          control={control}
          render={({ field }) => {
            const NONE_OPTION = { value: 0, label: 'None' };
            const dietaryOptions = [NONE_OPTION, ...options.dietary];
            const selected = dietaryNoneSelected
              ? [NONE_OPTION]
              : options.dietary.filter((o) => field.value.includes(o.value));
            return (
              <Field>
                <FieldLabel>Dietary Restrictions</FieldLabel>
                <Select
                  id='dietaryRestrictions'
                  instanceId='dietaryRestrictions'
                  isMulti
                  options={dietaryOptions}
                  value={selected}
                  onChange={(opts) => {
                    const vals = getMultiValues(opts);
                    const hasNone = vals.includes(0);
                    if (hasNone && !dietaryNoneSelected) {
                      setDietaryNoneSelected(true);
                      field.onChange([]);
                    } else if (hasNone && dietaryNoneSelected) {
                      setDietaryNoneSelected(false);
                      field.onChange(vals.filter((v) => v !== 0));
                    } else {
                      setDietaryNoneSelected(false);
                      field.onChange(vals);
                    }
                  }}
                />
                {selected.some((o) => isOtherOption(o.label)) && (
                  <Input
                    {...register('dietaryOtherText')}
                    placeholder='Please specify'
                    aria-label='Specify dietary restriction'
                  />
                )}
              </Field>
            );
          }}
        />

        <Field>
          <FieldLabel htmlFor='linkedinUrl'>
            LinkedIn{' '}
            <span className='text-muted-foreground font-normal'>
              (optional)
            </span>
          </FieldLabel>
          <Input
            {...register('linkedinUrl')}
            id='linkedinUrl'
            type='url'
            placeholder='https://linkedin.com/in/janedoe'
          />
          {errors.linkedinUrl && <FieldError errors={[errors.linkedinUrl]} />}
        </Field>
      </FieldGroup>
      <div className='mt-6 flex justify-end'>
        <Button type='button' onClick={handleNext}>
          Continue
        </Button>
      </div>
    </>
  );

  const aboutFields = (
    <>
      {aboutOptional && (
        <FieldDescription className='mb-6'>
          Only needed if you also take part in events as a hacker. Leave it
          blank otherwise, or fill in your university, program and year
          together.
        </FieldDescription>
      )}
      <FieldGroup>
        <Controller
          name='universityId'
          control={control}
          render={({ field, fieldState }) => {
            const selected = options.universities.find(
              (o) => o.value === field.value,
            );
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>
                  University / Institution
                  {!aboutOptional && <RequiredAsterisk />}
                </FieldLabel>
                <Select
                  id='universityId'
                  instanceId='universityId'
                  options={options.universities}
                  value={selected ?? null}
                  onChange={(opt) => field.onChange(getSingleValue(opt))}
                />
                {fieldState.error && <FieldError errors={[fieldState.error]} />}
                {isOtherOption(selected?.label) && (
                  <Input
                    {...register('universityOtherText')}
                    placeholder='Please specify'
                    aria-label='Specify university'
                  />
                )}
              </Field>
            );
          }}
        />

        <Controller
          name='majorId'
          control={control}
          render={({ field, fieldState }) => {
            const selected = options.majors.find(
              (o) => o.value === field.value,
            );
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>
                  Major / Program
                  {!aboutOptional && <RequiredAsterisk />}
                </FieldLabel>
                <Select
                  id='majorId'
                  instanceId='majorId'
                  options={options.majors}
                  value={selected ?? null}
                  onChange={(opt) => field.onChange(getSingleValue(opt))}
                />
                {fieldState.error && <FieldError errors={[fieldState.error]} />}
                {isOtherOption(selected?.label) && (
                  <Input
                    {...register('majorOtherText')}
                    placeholder='Please specify'
                    aria-label='Specify major'
                  />
                )}
              </Field>
            );
          }}
        />

        <Controller
          name='yearOfStudyId'
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>
                Year of Study
                {!aboutOptional && <RequiredAsterisk />}
              </FieldLabel>
              <Select
                id='yearOfStudyId'
                instanceId='yearOfStudyId'
                options={options.years}
                value={
                  options.years.find((o) => o.value === field.value) ?? null
                }
                onChange={(opt) => field.onChange(getSingleValue(opt))}
              />
              {fieldState.error && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Field>
          <FieldLabel htmlFor='githubUrl'>
            GitHub{' '}
            <span className='text-muted-foreground font-normal'>
              (optional)
            </span>
          </FieldLabel>
          <Input
            {...register('githubUrl')}
            id='githubUrl'
            type='url'
            placeholder='https://github.com/janedoe'
          />
          {errors.githubUrl && <FieldError errors={[errors.githubUrl]} />}
        </Field>
      </FieldGroup>

      <div className='mt-6'>
        <ProfileAssets
          hasResume={hasResume}
          resumeFileName={resumeFileName}
          queuedResume={queuedResume}
          onQueueResume={setQueuedResume}
          disabled={isSubmitting || uploadingResume}
        />
      </div>

      <div className='mt-6 flex justify-between gap-3'>
        <Button
          type='button'
          variant='outline'
          onClick={() => setTab('personal')}
          disabled={isSubmitting || uploadingResume}
        >
          Back
        </Button>
        <Button type='submit' disabled={isSubmitting || uploadingResume}>
          {isSubmitting || uploadingResume ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' /> Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
      {submitError && (
        <FieldError className='mt-2 text-right'>{submitError}</FieldError>
      )}
    </>
  );

  return (
    <Tabs value={tab} onValueChange={setTab} className='w-full'>
      <TabsList
        className={`mb-6 grid w-full ${extraTab ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        <TabsTrigger
          value='personal'
          className={
            tabHasError(PERSONAL_FIELDS) ? 'text-destructive underline' : ''
          }
        >
          {tabLabels.personal}
        </TabsTrigger>
        <TabsTrigger
          value='about'
          className={
            tabHasError(ABOUT_FIELDS) ? 'text-destructive underline' : ''
          }
        >
          {aboutLabel}
        </TabsTrigger>
        {extraTab && (
          <TabsTrigger value={extraTab.value}>{extraTab.label}</TabsTrigger>
        )}
      </TabsList>

      <form
        ref={formRef}
        onSubmit={handleSubmit(submitHandler)}
        onChange={() => setSubmitError(undefined)}
      >
        <TabsContent value='personal'>{personalFields}</TabsContent>

        <TabsContent value='about'>{aboutFields}</TabsContent>
      </form>

      {extraTab && (
        // Kept mounted so switching tabs doesn't drop its unsaved edits.
        <TabsContent
          value={extraTab.value}
          forceMount
          className='data-[state=inactive]:hidden'
        >
          {extraTab.content}
        </TabsContent>
      )}
    </Tabs>
  );
}
