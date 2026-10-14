import { Suspense } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';

import { getAudienceOptions, listCampaigns } from '@/lib/campaigns/queries';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';
import { NewCampaignDialog } from './_components/new-campaign-dialog';
import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CampaignStatus } from '@/db/schema';

const STATUS_BADGE: Record<
  CampaignStatus,
  {
    label: string;
    variant: 'outline' | 'info' | 'warning' | 'success' | 'destructive';
  }
> = {
  draft: { label: 'Draft', variant: 'outline' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  sending: { label: 'Sending', variant: 'warning' },
  sent: { label: 'Sent', variant: 'success' },
  cancelled: { label: 'Stopped', variant: 'destructive' },
};

function CampaignListSkeleton() {
  return (
    <div
      className='bg-muted animate-pulse rounded-xl'
      style={{ height: 220 }}
    />
  );
}

// Reads the session and the campaign list, so it streams in behind Suspense
// while the heading ships in the shell.
async function CampaignList() {
  await requireAuthWithPermission('campaign:read:all');
  const rows = await listCampaigns();

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className='py-8 text-center'>
          <p className='text-muted-foreground text-sm'>No campaigns yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='py-0'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className='hidden sm:table-cell'>Last edited</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const status = STATUS_BADGE[row.status];
            return (
              <TableRow key={row.id}>
                <TableCell className='max-w-56 truncate font-medium'>
                  <Link
                    href={`/dashboard/admin/campaigns/${row.id}`}
                    className='hover:underline'
                  >
                    {row.name}
                  </Link>
                  {row.eventName && (
                    <span className='text-muted-foreground block truncate text-xs font-normal'>
                      {row.eventName}
                    </span>
                  )}
                </TableCell>
                <TableCell className='capitalize'>{row.type}</TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {row.status === 'scheduled' && row.scheduledFor && (
                    <span className='text-muted-foreground mt-1 block text-xs'>
                      <LocalDateTime
                        value={row.scheduledFor}
                        dateStyle='medium'
                        timeStyle='short'
                      />
                    </span>
                  )}
                </TableCell>
                <TableCell className='text-muted-foreground hidden text-xs sm:table-cell'>
                  <LocalDateTime
                    value={row.updatedAt}
                    dateStyle='medium'
                    timeStyle='short'
                  />
                  {row.updatedByName && <> by {row.updatedByName}</>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// Creating a draft runs `createCampaign`, which requires campaign:write:all.
async function NewCampaignButton() {
  const user = await getUser();
  if (!user || !(await hasPermission(user.id, 'campaign:write:all'))) {
    return null;
  }
  const [options, canSendOperational] = await Promise.all([
    getAudienceOptions(),
    hasPermission(user.id, 'campaign:operational:all'),
  ]);
  return (
    <NewCampaignDialog
      events={options.events.map(({ id, name }) => ({ id, name }))}
      canSendOperational={canSendOperational}
    />
  );
}

export default function AdminCampaignsPage() {
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-semibold'>Campaigns</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            Write emails and send them to rule-based audiences.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button asChild variant='outline'>
            <Link href='/dashboard/admin/campaigns/audiences'>
              <Users /> Saved audiences
            </Link>
          </Button>
          <Suspense fallback={null}>
            <NewCampaignButton />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<CampaignListSkeleton />}>
        <CampaignList />
      </Suspense>
    </div>
  );
}
