import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { RsvpStatusForUser } from '@/app/dashboard/events/actions';
import { RsvpResponseButtons } from '@/app/dashboard/events/RsvpResponseButtons';
import { RSVP_TIMELINE_LABELS } from '@/app/dashboard/events/rsvp-status';
import { RSVP_DASHBOARD_LABELS } from '@/app/dashboard/events/event-display-status';
import { formatRsvpDateTime } from '@/lib/rsvp/rsvp-datetime';

type Props = {
  eventId: string;
  rsvp: RsvpStatusForUser;
};

/**
 * RSVP status card for the event page. Pending shows Accept/Decline;
 * final statuses show a message only.
 */
export function RsvpStatusCard({ eventId, rsvp }: Props) {
  const { statusLabel, statusDisplay, respondBy, respondedAt } = rsvp;
  const isPending = statusLabel === 'pending';
  const respondByFormatted = respondBy ? formatRsvpDateTime(respondBy) : null;
  const respondedAtFormatted = respondedAt
    ? formatRsvpDateTime(respondedAt)
    : null;

  const title = RSVP_DASHBOARD_LABELS[statusLabel];
  const description = isPending
    ? 'Your application was accepted. Please confirm whether you will attend.'
    : statusDisplay.description;

  const metaLine = isPending
    ? respondByFormatted
      ? `${RSVP_TIMELINE_LABELS.respondBy} ${respondByFormatted}`
      : null
    : respondedAtFormatted
      ? `${RSVP_TIMELINE_LABELS.respondedAt} ${respondedAtFormatted}`
      : null;

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-base'>{title}</CardTitle>
          <Badge variant={isPending ? 'purple' : statusDisplay.variant}>
            {title}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {(metaLine || isPending) && (
        <CardContent className='space-y-4'>
          {metaLine && (
            <p className='text-muted-foreground text-sm'>{metaLine}</p>
          )}
          {isPending && <RsvpResponseButtons eventId={eventId} />}
        </CardContent>
      )}
    </Card>
  );
}
