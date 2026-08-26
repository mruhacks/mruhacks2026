'use client';

import * as React from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { SingleValue, MultiValue } from 'react-select';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Field,
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
  profileFormSchema,
  type ProfileFormValues,
} from '@/components/profile-form/schema';
import { type ProfileFormOptions } from '@/components/profile-form/schema';
import { useRouter } from 'next/navigation';

// Mirrors the welcome onboarding flow's step categories (Personal / About you).
const tabLabels: Record<string, string> = {
  personal: 'Personal',
  about: 'About you',
};

const PERSONAL_FIELDS = ['fullName', 'genderId', 'dietaryRestrictions'] as const;
const ABOUT_FIELDS = ['universityId', 'majorId', 'yearOfStudyId'] as const;

const getSingleValue = (opt: SingleValue<{ value: number; label: string }>) =>
  opt?.value ?? '';
const getMultiValues = (opts: MultiValue<{ value: number; label: string }>) =>
  opts.map((o) => o.value);

type ProfileFormProps = {
  initial?: Partial<ProfileFormValues>;
  options: ProfileFormOptions;
  onSubmit: (data: ProfileFormValues) => Promise<ActionResult | void>;
  submitLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  nextUrl?: string;
  /** Called after a successful save before the default navigation occurs. */
  onSuccess?: () => void;
  /** Resume upload state, shown in the About you tab. */
  hasResume: boolean;
  resumeFileName: string | null;
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
  nextUrl,
  onSuccess,
  hasResume,
  resumeFileName,
}: ProfileFormProps) {
  const router = useRouter();
  const {
    control,
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema) as Resolver<ProfileFormValues>,
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

  const [tab, setTab] = React.useState<'personal' | 'about'>('personal');
  const [queuedResume, setQueuedResume] = React.useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = React.useState(false);
  const [dietaryNoneSelected, setDietaryNoneSelected] = React.useState(false);

  const submitHandler = React.useCallback(
    async (data: ProfileFormValues) => {
      try {
        const result = await onSubmit(data);

        if (isActionResult(result) && !result.success) {
          toast.error(result.error ?? errorMessage);
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
            toast.error(uploadResult.error ?? 'Failed to upload resume.');
            return;
          }
          setQueuedResume(null);
        }

        toast.success(successMessage);
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(nextUrl ?? '/dashboard');
        }
      } catch (err) {
        console.error('Profile submission error:', err);
        toast.error(errorMessage);
      }
    },
    [
      onSubmit,
      successMessage,
      errorMessage,
      router,
      nextUrl,
      onSuccess,
      queuedResume,
    ],
  );

  const focusActiveSection = () => {
    requestAnimationFrame(() => {
      const nextPanel = document.querySelector(
        `[role="tabpanel"][data-state="active"]`,
      ) as HTMLElement | null;
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
      console.error(e);
    }

    setTab('about');
    focusActiveSection();
  };

  const tabHasError = (fields: readonly (keyof ProfileFormValues)[]) =>
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
                {fieldState.error && (
                  <FieldError errors={[fieldState.error]} />
                )}
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
                  <RequiredAsterisk />
                </FieldLabel>
                <Select
                  id='universityId'
                  instanceId='universityId'
                  options={options.universities}
                  value={selected ?? null}
                  onChange={(opt) => field.onChange(getSingleValue(opt))}
                />
                {fieldState.error && (
                  <FieldError errors={[fieldState.error]} />
                )}
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
                  <RequiredAsterisk />
                </FieldLabel>
                <Select
                  id='majorId'
                  instanceId='majorId'
                  options={options.majors}
                  value={selected ?? null}
                  onChange={(opt) => field.onChange(getSingleValue(opt))}
                />
                {fieldState.error && (
                  <FieldError errors={[fieldState.error]} />
                )}
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
                <RequiredAsterisk />
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
    </>
  );

  return (
    <form onSubmit={handleSubmit(submitHandler)}>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'personal' | 'about')}
        className='w-full'
      >
        <TabsList className='mb-6 grid w-full grid-cols-2'>
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
            {tabLabels.about}
          </TabsTrigger>
        </TabsList>

        <TabsContent value='personal'>{personalFields}</TabsContent>

        <TabsContent value='about'>{aboutFields}</TabsContent>
      </Tabs>
    </form>
  );
}
