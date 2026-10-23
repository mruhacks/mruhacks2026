import { Suspense } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { getDisplaySettings } from '@/lib/display/feed';
import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DisplaySettingsCard } from './display-settings-card';

export default function DisplaysPage() {
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Lobby displays</h1>
          <p className='text-muted-foreground text-sm'>
            Screens showing the featured event&rsquo;s banner, sponsors and schedule. Open <code>/display</code>{' '}
            full-screen on any screen.
          </p>
        </div>
        <Button asChild size='sm'>
          <Link href='/display' target='_blank'>
            <ExternalLink className='size-4' /> Open display
          </Link>
        </Button>
      </div>
      <Suspense fallback={<Skeleton className='h-48 w-full rounded-xl' />}>
        <DisplaysContent />
      </Suspense>
    </div>
  );
}

async function DisplaysContent() {
  await requireAuthWithPermission('display:manage:all');
  return <DisplaySettingsCard initial={await getDisplaySettings()} />;
}
