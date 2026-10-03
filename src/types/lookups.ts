/**
 * Canonical lookup option lists and their types.
 * Used by forms (dropdowns), seed script, and anywhere that needs the allowed values
 * for profile/application lookups (genders, universities, majors, etc.).
 */

export const gendersList = [
  'Male',
  'Female',
  'Non-binary',
  'Other',
  'Prefer not to say',
] as const;
export type Gender = (typeof gendersList)[number];

export const universitiesList = [
  'Mount Royal University',
  'University of Calgary',
  'University of Alberta',
  'University of Lethbridge',
  'MacEwan University',
  'SAIT',
  'NAIT',
  'Other / Not listed',
] as const;
export type University = (typeof universitiesList)[number];

export const majorsList = [
  'Bachelor of Computer Information Systems',
  'Computer Science',
  'Data Science',
  'Computer Engineering',
  'Cybersecurity',
  'Information Systems',
  'Software Engineering',
  'Other / Custom',
] as const;
export type Major = (typeof majorsList)[number];

export const yearsOfStudyList = ['1st', '2nd', '3rd', '4th', '4th+'] as const;
export type YearOfStudy = (typeof yearsOfStudyList)[number];

export const interestsList = [
  'Mobile App Development',
  'Web Development',
  'Data Science and ML',
  'UX / UI Design',
  'Game Development',
] as const;
export type Interest = (typeof interestsList)[number];

export const dietaryRestrictionsList = [
  'Vegetarian',
  'Vegan',
  'Halal',
  'Kosher',
  'Gluten-free',
  'Peanuts / Tree-nuts Allergy',
  'Other',
] as const;
export type DietaryRestriction = (typeof dietaryRestrictionsList)[number];

export const heardFromSourcesList = [
  'Poster',
  'Friend / Classmate',
  'Classroom Visit',
  'Social Media',
  'Professor / Course Announcement',
  'Other',
] as const;
export type HeardFromSource = (typeof heardFromSourcesList)[number];

/**
 * The single participation lifecycle for a person and an event — see the
 * registration flow in docs/ARCHITECTURE.md. Application review, the RSVP
 * invitation, and attendance are all stages of this one status; there is no
 * separate application or RSVP status.
 *
 * Checked-in and no-show are not stored: they're derived from `accepted`
 * plus the `check_ins` table (see `deriveAttendance`).
 */
export const participationStatusesList = [
  'pending_review',
  'waitlisted',
  'denied',
  'invited',
  'accepted',
  'declined',
  'timed_out',
] as const;
export type ParticipationStatus = (typeof participationStatusesList)[number];

export type StatusBadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'outline'
  | 'purple';

/**
 * Display config for each participation status, seeded into the
 * `participation_statuses` table (title, description, badge variant).
 */
export const participationStatusDisplayList = [
  {
    label: 'pending_review',
    title: 'Under review',
    description:
      "We're reviewing your application and will email you when a decision has been made.",
    variant: 'warning',
  },
  {
    label: 'waitlisted',
    title: 'Waitlisted',
    description:
      "You're on the waitlist. We'll email you an invitation when a spot opens up.",
    variant: 'secondary',
  },
  {
    label: 'denied',
    title: 'Not accepted',
    description:
      'Thanks for applying — unfortunately we were not able to offer you a spot. Please contact us if you think this was a mistake.',
    variant: 'destructive',
  },
  {
    label: 'invited',
    title: 'RSVP required',
    description:
      "You've been offered a spot! Please confirm whether you will attend before the deadline.",
    variant: 'purple',
  },
  {
    label: 'accepted',
    title: 'Confirmed',
    description: "Your spot is confirmed. We'll see you there!",
    variant: 'success',
  },
  {
    label: 'declined',
    title: 'Declined',
    description: "You've given up your spot.",
    variant: 'destructive',
  },
  {
    label: 'timed_out',
    title: 'RSVP expired',
    description: 'Your RSVP window ended without a response.',
    variant: 'secondary',
  },
] as const satisfies readonly {
  label: ParticipationStatus;
  title: string;
  description: string;
  variant: StatusBadgeVariant;
}[];

export const eventTypesList = ['meal', 'workshop', 'hackathon'] as const;
export type EventType = (typeof eventTypesList)[number];
