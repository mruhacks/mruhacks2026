import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getAdminEventHeader } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';
import { BentoCard, BentoCardSkeleton } from '../../_components/bento-card';

type Props = { params: Promise<{ eventId: string }> };
export default function CopyCell({ params }: Props) {
  return (
    <Suspense fallback={<BentoCardSkeleton rows={2} />}>
      <EventCopy params={params} />
    </Suspense>
  );
}
async function EventCopy({ params }: Props) {
  const { eventId: segment } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) return null;
  const user = await getUser();
  if (!user) redirect('/signin');
  if (!(await hasPermission(user.id, 'event:manage'))) return null;
  const event = await getAdminEventHeader(eventId);
  if (!event) return null;
  return (
    <BentoCard
      title='Event copy'
      description='Description and terms shown to participants.'
    >
      <div className='flex flex-col gap-4'>
        {[
          {
            path: 'description',
            label: 'Description',
            exists: Boolean(event.descriptionMarkdown),
          },
          {
            path: 'terms',
            label: 'Event terms',
            exists: Boolean(event.termsMarkdown),
            desc: 'The rules and terms of the event that participants must agree to during rsvp.',
          },
        ].map((item) => (
          <div
            key={item.path}
            className='flex items-center justify-between gap-3'
          >
            <div>
              <p className='font-medium'>{item.label}</p>
              {item.desc && (
                <p className='text-muted-foreground text-xs'>{item.desc}</p>
              )}
              <p className='text-muted-foreground text-sm'>
                {item.exists ? 'Added' : 'Not added yet'}
              </p>
            </div>
            <Button asChild variant='outline' size='sm'>
              <Link
                href={`/dashboard/admin/events/${segment}/settings/${item.path}`}
                aria-label={`Edit ${item.label.toLowerCase()}`}
              >
                Edit
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}
