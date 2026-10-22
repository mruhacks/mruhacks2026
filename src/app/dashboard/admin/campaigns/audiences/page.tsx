import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import * as Campaigns from '@/lib/campaigns/server';
import * as Rbac from '@/lib/rbac/server';
import { LocalDateTime } from '@/components/local-date-time';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NewAudienceForm } from '../_components/new-audience-form';

function ListSkeleton() {
  return <div className='bg-muted h-56 animate-pulse rounded-xl' />;
}

async function AudienceList() {
  const user = await Rbac.requireAuthWithPermission('campaign:read:all');
  const [rows, canWrite] = await Promise.all([
    Campaigns.listSavedAudiences(),
    Rbac.hasPermission(user.id, 'campaign:write:all'),
  ]);

  return (
    <div className='space-y-4'>
      {canWrite && <NewAudienceForm />}
      {rows.length === 0 ? (
        <Card>
          <CardContent className='py-8 text-center'>
            <p className='text-muted-foreground text-sm'>No saved audiences yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className='py-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead className='hidden sm:table-cell'>Last edited</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='max-w-56 truncate font-medium'>
                    <Link href={`/dashboard/admin/campaigns/audiences/${row.id}`} className='hover:underline'>
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {row.usedBy === 0 ? '—' : `${row.usedBy} ${row.usedBy === 1 ? 'campaign' : 'campaigns'}`}
                    {row.scheduled > 0 && ` (${row.scheduled} scheduled)`}
                  </TableCell>
                  <TableCell className='text-muted-foreground hidden text-xs sm:table-cell'>
                    <LocalDateTime value={row.updatedAt} dateStyle='medium' timeStyle='short' />
                    {row.updatedByName && <> by {row.updatedByName}</>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

export default function SavedAudiencesPage() {
  return (
    <div className='space-y-6'>
      <Link
        href='/dashboard/admin/campaigns'
        className='text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline'
      >
        <ArrowLeft className='size-4' /> All campaigns
      </Link>
      <div>
        <h1 className='text-2xl font-semibold'>Saved audiences</h1>
        <p className='text-muted-foreground mt-1 text-sm'>
          Reusable audience rules. A campaign linked to one always uses its current rules.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <AudienceList />
      </Suspense>
    </div>
  );
}
