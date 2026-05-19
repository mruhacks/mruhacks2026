import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  type ApplicationStatusLabel,
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
  statusKey: ApplicationStatusLabel | null;
  waitlistPosition: number | null;
  createdAt: Date;
  reviewedAt: Date | null;
  standalone?: boolean;
};

export function ApplicationStatusBanner({
  statusKey,
  waitlistPosition,
  createdAt,
  reviewedAt,
  standalone = false,
}: Props) {
  const display = getApplicationStatusDisplay(statusKey);
  const label = getApplicationStatusLabel(statusKey, waitlistPosition);
  const submitted = formatDate(createdAt);
  const reviewed = formatDate(reviewedAt);

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
            {submitted && (
              <div>
                <dt className='text-muted-foreground'>Submitted</dt>
                <dd>{submitted}</dd>
              </div>
            )}
            {reviewed && (
              <div>
                <dt className='text-muted-foreground'>Decision made</dt>
                <dd>{reviewed}</dd>
              </div>
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
          <p className='text-muted-foreground text-xs'>Submitted {submitted}</p>
        )}
      </div>
    </div>
  );
}
