import type { RsvpStatusForUser } from '@/app/dashboard/events/actions';
import { RsvpResponseButtons } from '@/app/dashboard/events/RsvpResponseButtons';
import { getAttendeeRsvpCardDescription } from '@/app/dashboard/events/attendee-rsvp-copy';
import { RSVP_TIMELINE_LABELS } from '@/app/dashboard/events/rsvp-status';
import { RSVP_DASHBOARD_LABELS } from '@/app/dashboard/events/event-display-status';
import { EventParticipationStatusCard } from '@/app/dashboard/events/EventParticipationStatusCard';
import { LocalDateTime } from '@/components/local-date-time';

type Props = {
  eventId: string;
  termsMarkdown: string | null;
  termsId: string | null;
  eventName: string;
  rsvp: RsvpStatusForUser;
};

/**
 * RSVP status card for the event page. Pending shows Accept/Decline;
 * final statuses show a message only.
 */
export function RsvpStatusCard({
  eventId,
  eventName,
  rsvp,
  termsMarkdown,
  termsId,
}: Props) {
  const { statusLabel, statusDisplay, respondBy, respondedAt } = rsvp;
  const isPending = statusLabel === 'pending';

  // RSVP_DASHBOARD_LABELS entries are all "RSVP <word>" — the badge only
  // needs the status word since the card title already says "RSVP".
  const statusWord = RSVP_DASHBOARD_LABELS[statusLabel].replace(/^RSVP /, '');
  const description = getAttendeeRsvpCardDescription(statusLabel, eventName);

  const metaDate = isPending ? respondBy : respondedAt;
  const metaLabel = isPending
    ? RSVP_TIMELINE_LABELS.respondBy
    : RSVP_TIMELINE_LABELS.respondedAt;

  return (
    <EventParticipationStatusCard
      title='RSVP'
      badgeLabel={statusWord}
      badgeVariant={isPending ? 'purple' : statusDisplay.variant}
      description={description}
      infoRows={
        metaDate
          ? [
              {
                key: 'meta-date',
                content: (
                  <>
                    {metaLabel}{' '}
                    <LocalDateTime
                      value={metaDate}
                      dateStyle='medium'
                      timeStyle='short'
                    />
                  </>
                ),
              },
            ]
          : []
      }
      footer={
        isPending ? (
          <RsvpResponseButtons
            eventId={eventId}
            termsMarkdown={termsMarkdown}
            termsId={termsId}
          />
        ) : undefined
      }
    />
  );
}
