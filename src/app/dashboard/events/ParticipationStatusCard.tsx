import Link from 'next/link';

import type { ParticipationForUser } from '@/app/dashboard/events/actions';
import { EventParticipationStatusCard } from '@/app/dashboard/events/EventParticipationStatusCard';
import { RsvpResponseButtons } from '@/app/dashboard/events/RsvpResponseButtons';
import { WithdrawParticipationButton } from '@/app/dashboard/events/WithdrawParticipationButton';
import { LocalDateTime } from '@/components/local-date-time';
import { Button } from '@/components/ui/button';
import { canEditApplication } from '@/lib/participation/status';

type Props = {
  eventId: string;
  eventHref: string;
  participation: ParticipationForUser;
  termsMarkdown: string | null;
  termsId: string | null;
  /** Wallet / ticket controls, shown while the participant holds a spot. */
  pass?: React.ReactNode;
};

function DateRow({ label, value }: { label: string; value: Date }) {
  return (
    <>
      {label}{' '}
      <LocalDateTime value={value} dateStyle='medium' timeStyle='short' />
    </>
  );
}

/**
 * The participant's one status card for an event with an application: the
 * review outcome, the RSVP and attendance are all the same status, so there's
 * one badge and the controls that status allows.
 */
export function ParticipationStatusCard({
  eventId,
  eventHref,
  participation,
  termsMarkdown,
  termsId,
  pass,
}: Props) {
  const { status, display, invitation, createdAt } = participation;

  const infoRows: { key: string; content: React.ReactNode }[] = [
    {
      key: 'submitted',
      content: <DateRow label='Applied' value={createdAt} />,
    },
  ];
  if (status === 'invited' && invitation) {
    infoRows.push({
      key: 'respond-by',
      content: <DateRow label='Respond by' value={invitation.respondBy} />,
    });
  } else if (invitation?.respondedAt) {
    infoRows.push({
      key: 'responded',
      content: <DateRow label='Responded' value={invitation.respondedAt} />,
    });
  }

  let footer: React.ReactNode;
  if (canEditApplication(status)) {
    footer = (
      <Button asChild size='sm' variant='outline'>
        <Link href={`${eventHref}/apply`}>Edit application</Link>
      </Button>
    );
  } else if (status === 'invited') {
    footer = (
      <RsvpResponseButtons
        eventId={eventId}
        termsMarkdown={termsMarkdown}
        termsId={termsId}
      />
    );
  } else if (status === 'waitlisted') {
    footer = <WithdrawParticipationButton eventId={eventId} kind='waitlist' />;
  } else if (status === 'accepted') {
    footer = (
      <div className='flex flex-col gap-2'>
        {pass && <div className='flex flex-row gap-2'>{pass}</div>}
        <WithdrawParticipationButton eventId={eventId} kind='spot' />
      </div>
    );
  }

  return (
    <EventParticipationStatusCard
      title='Your status'
      badgeLabel={display.title}
      badgeVariant={display.variant}
      description={display.description}
      infoRows={infoRows}
      footer={footer}
    />
  );
}
