import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ApplicationStatusForUser } from '@/app/dashboard/events/actions';
import {
  APPLICATION_TIMELINE_FIELDS,
  APPLICATION_TIMELINE_LABELS,
  getApplicationStatusDisplay,
  getApplicationStatusLabel,
} from '@/app/dashboard/events/application-status';

function formatDate(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

type Props = {
  application: ApplicationStatusForUser;
  /** Full card layout vs compact banner above the form. */
  standalone?: boolean;
};

/** Application status badge and timeline for the current user. */
export function ApplicationStatusBanner({
  application,
  standalone = false,
}: Props) {
  const { statusKey, waitlistPosition, createdAt, reviewedAt } = application;
  const display = getApplicationStatusDisplay(statusKey);
  const label = getApplicationStatusLabel(statusKey, waitlistPosition);
  const timelineSource = { createdAt, reviewedAt };
  const submitted = formatDate(createdAt);

  if (standalone) {
    return (
      <Card className='w-full sm:max-w-2xl'>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle>Application status</CardTitle>
            <Badge variant={display.variant}>{label}</Badge>
          </div>
          <CardDescription>{display.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-2 text-sm sm:grid-cols-2'>
            {APPLICATION_TIMELINE_FIELDS.map(
              ({ key, label: fieldLabel, getDate }) => {
                const formatted = formatDate(getDate(timelineSource));
                if (!formatted) return null;
                return (
                  <div key={key}>
                    <dt className='text-muted-foreground'>{fieldLabel}</dt>
                    <dd>{formatted}</dd>
                  </div>
                );
              },
            )}
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='bg-muted/40 flex items-start gap-3 rounded-lg border p-4'>
      <Badge variant={display.variant} className='shrink-0'>
        {label}
      </Badge>
      <div className='space-y-0.5 text-sm'>
        <p>{display.description}</p>
        {submitted && (
          <p className='text-muted-foreground text-xs'>
            {APPLICATION_TIMELINE_LABELS.submitted} {submitted}
          </p>
        )}
      </div>
    </div>
  );
}
