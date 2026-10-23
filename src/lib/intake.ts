/**
 * "Intake" is how an event takes people in: applications when it has one,
 * plain registrations when it doesn't. Pure helpers, safe on the client.
 */

/**
 * True once an event stops taking new applications (or registrations, for an
 * event without an application): the organizer closed them by hand, or the
 * configured close instant has passed. Separate from `hasEventElapsed` —
 * an event that has ended is closed for its own reason and message.
 */
export function areApplicationsClosed(
  event: { applicationsClosed: boolean; applicationsCloseAt: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    event.applicationsClosed ||
    (event.applicationsCloseAt != null &&
      event.applicationsCloseAt.getTime() <= now.getTime())
  );
}

export type IntakeCopy = {
  /** Heading form: "Applications" / "Registration". */
  title: 'Applications' | 'Registration';
  /** Lowercase plural for running text: "no new applications". */
  noun: 'applications' | 'registrations';
  /** Prefix for a deadline: "Applications close" / "Registration closes". */
  closesLabel: 'Applications close' | 'Registration closes';
  /** Returned by the server actions when intake is closed to a newcomer. */
  closedMessage: string;
};

const APPLICATION_COPY: IntakeCopy = {
  title: 'Applications',
  noun: 'applications',
  closesLabel: 'Applications close',
  closedMessage: 'Applications for this event are closed.',
};

const REGISTRATION_COPY: IntakeCopy = {
  title: 'Registration',
  noun: 'registrations',
  closesLabel: 'Registration closes',
  closedMessage: 'Registration for this event is closed.',
};

export function intakeCopy(hasApplication: boolean): IntakeCopy {
  return hasApplication ? APPLICATION_COPY : REGISTRATION_COPY;
}
