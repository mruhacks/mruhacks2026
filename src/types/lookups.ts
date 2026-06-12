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
  'Computer Science',
  'Software Engineering',
  'Information Systems',
  'Data Science',
  'Cybersecurity',
  'Computer Engineering',
  'UX / UI Design',
  'Game Development',
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

export const applicationStatusesList = [
  'pending_review',
  'approved',
  'denied',
  'waitlisted',
] as const;
export type ApplicationStatus = (typeof applicationStatusesList)[number];

export type ApplicationStatusBadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'outline';

/**
 * Display config for each application status, seeded into the
 * `application_statuses` table (title, description, badge variant, isFinal).
 */
export const applicationStatusDisplayList = [
  {
    label: 'pending_review',
    title: 'Under review',
    description:
      "We're reviewing your application and will email you when a decision has been made.",
    variant: 'warning',
    isFinal: false,
  },
  {
    label: 'approved',
    title: 'Accepted',
    description: "You're in! Check your email and ticket for next steps.",
    variant: 'success',
    isFinal: true,
  },
  {
    label: 'waitlisted',
    title: 'Waitlisted',
    description: "You're on the waitlist. We'll reach out if a spot opens up.",
    variant: 'secondary',
    isFinal: true,
  },
  {
    label: 'denied',
    title: 'Not accepted',
    description:
      'Thanks for applying — unfortunately we were not able to offer you a spot.',
    variant: 'destructive',
    isFinal: true,
  },
] as const satisfies readonly {
  label: ApplicationStatus;
  title: string;
  description: string;
  variant: ApplicationStatusBadgeVariant;
  isFinal: boolean;
}[];

export const rsvpStatusesList = [
  'pending',
  'accepted',
  'declined',
  'timed_out',
] as const;
export type RsvpStatus = (typeof rsvpStatusesList)[number];

export const eventTypesList = ['meal', 'workshop', 'hackathon'] as const;
export type EventType = (typeof eventTypesList)[number];
