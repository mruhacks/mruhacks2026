import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ParticipationForUser } from '@/app/dashboard/events/actions';
import { LocalDateTime } from '@/components/local-date-time';
import { canEditApplication } from '@/lib/participation/status';

const TIMELINE_FIELDS = [
  {
    key: 'submitted',
    label: 'Submitted',
    getDate: (p: ParticipationForUser) => p.createdAt,
  },
  {
    key: 'decisionMade',
    label: 'Decision made',
    getDate: (p: ParticipationForUser) => p.reviewedAt,
  },
] as const;

type Props = {
  application: ParticipationForUser;
  /** Full card layout vs compact banner above the form. */
  standalone?: boolean;
  /** When set (and the application is still editable), renders an "Edit application" button inside the banner. */
  editHref?: string;
};

/** Participation status badge and application timeline for the current user. */
export function ApplicationStatusBanner({
  application,
  standalone = false,
  editHref,
}: Props) {
  const { display, createdAt } = application;
  const label = display.title;
  const showEdit = Boolean(editHref) && canEditApplication(application.status);

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
            {TIMELINE_FIELDS.map(({ key, label: fieldLabel, getDate }) => {
              const date = getDate(application);
              if (!date) return null;
              return (
                <div key={key}>
                  <dt className='text-muted-foreground'>{fieldLabel}</dt>
                  <dd>
                    <LocalDateTime
                      value={date}
                      dateStyle='medium'
                      timeStyle='short'
                    />
                  </dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='bg-muted/40 flex flex-col gap-3 rounded-lg border p-4'>
      <div className='flex min-w-0 flex-col gap-2'>
        <Badge variant={display.variant} className='shrink-0'>
          {label}
        </Badge>
        <div className='flex min-w-0 flex-col gap-0.5 text-sm'>
          <p>{display.description}</p>
          {createdAt && (
            <p className='text-muted-foreground text-sm'>
              Submitted{' '}
              <LocalDateTime
                value={createdAt}
                dateStyle='medium'
                timeStyle='short'
              />
            </p>
          )}
        </div>
      </div>
      {showEdit && (
        <Button asChild size='sm' className='self-start'>
          <Link href={editHref!}>Edit application</Link>
        </Button>
      )}
    </div>
  );
}
