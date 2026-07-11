import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PencilIcon } from 'lucide-react';
import type {
  ProfileFormValues,
  ProfileFormOptions,
} from '@/components/profile-form/schema';

type ProfileViewProps = {
  profile: Partial<ProfileFormValues>;
  options: ProfileFormOptions;
};

export function ProfileView({ profile, options }: ProfileViewProps) {
  const getLabel = (id: number, list: { value: number; label: string }[]) => {
    return list.find((item) => item.value === id)?.label || 'Unknown';
  };

  const genderLabel = profile.genderId
    ? getLabel(profile.genderId, options.genders)
    : '—';
  const universityLabel = profile.universityId
    ? getLabel(profile.universityId, options.universities)
    : '—';
  const majorLabel = profile.majorId
    ? getLabel(profile.majorId, options.majors)
    : '—';
  const yearLabel = profile.yearOfStudyId
    ? getLabel(profile.yearOfStudyId, options.years)
    : '—';

  const interestLabels = (profile.interests ?? []).map((id) =>
    getLabel(id, options.interests),
  );
  const dietaryLabels = (profile.dietaryRestrictions ?? []).map((id) =>
    getLabel(id, options.dietary),
  );

  return (
    <div className='space-y-4'>
      <div>
        <h3 className='text-lg font-semibold'>Your Profile</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          Some of the information on your profile might be used by event
          organizers, so please make sure it is up to date.
        </p>
      </div>

      <div className='space-y-3 rounded-lg border p-4'>
        <div className='mb-4 flex items-center justify-between'>
          <p className='text-xs font-semibold text-muted-foreground'>PROFILE DETAILS</p>
          <Button variant='ghost' size='sm' asChild>
            <Link href='/dashboard/profile'>
              <PencilIcon className='mr-2 size-4' />
              Edit
            </Link>
          </Button>
        </div>
        <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
          <div>
            <p className='text-muted-foreground text-xs font-semibold'>
              Full Name
            </p>
            <p className='text-sm'>{profile.fullName || '—'}</p>
          </div>
          <div>
            <p className='text-muted-foreground text-xs font-semibold'>
              Gender
            </p>
            <p className='text-sm'>{genderLabel}</p>
          </div>
          <div>
            <p className='text-muted-foreground text-xs font-semibold'>
              University
            </p>
            <p className='text-sm'>{universityLabel}</p>
          </div>
          <div>
            <p className='text-muted-foreground text-xs font-semibold'>Major</p>
            <p className='text-sm'>{majorLabel}</p>
          </div>
          <div>
            <p className='text-muted-foreground text-xs font-semibold'>
              Year of Study
            </p>
            <p className='text-sm'>{yearLabel}</p>
          </div>
        </div>

        {interestLabels.length > 0 && (
          <div>
            <p className='text-muted-foreground text-xs font-semibold'>
              Interests
            </p>
            <div className='mt-1 flex flex-wrap gap-1'>
              {interestLabels.map((label) => (
                <span
                  key={label}
                  className='bg-muted inline-block rounded-full px-2 py-0.5 text-xs'
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {dietaryLabels.length > 0 && (
          <div>
            <p className='text-muted-foreground text-xs font-semibold'>
              Dietary Restrictions
            </p>
            <div className='mt-1 flex flex-wrap gap-1'>
              {dietaryLabels.map((label) => (
                <span
                  key={label}
                  className='bg-muted inline-block rounded-full px-2 py-0.5 text-xs'
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
