import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';

import { getAudienceOptions, getCampaign } from '@/lib/campaigns/queries';
import { listSavedAudiences } from '@/lib/campaigns/saved-audiences';
import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { loadUserPermissions } from '@/lib/rbac/authorization';
import { anyPermissionMatches } from '@/lib/rbac/permissions';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { CampaignEditor } from '../_components/campaign-editor';

type Props = { params: Promise<{ campaignId: string }> };

/** Sync shell, so the segment contributes to the route's App Shell. */
export default function CampaignPage({ params }: Props) {
  return (
    <div className='space-y-6'>
      <Link
        href='/dashboard/admin/campaigns'
        className='text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline'
      >
        <ArrowLeft className='size-4' /> All campaigns
      </Link>
      <React.Suspense fallback={<CampaignSkeleton />}>
        <CampaignContent paramsPromise={params} />
      </React.Suspense>
    </div>
  );
}

function CampaignSkeleton() {
  return <div className='bg-muted h-96 animate-pulse rounded-xl' />;
}

async function CampaignContent({ paramsPromise }: { paramsPromise: Promise<{ campaignId: string }> }) {
  const { campaignId } = await paramsPromise;
  const user = await requireAuthWithPermission('campaign:read:all');
  if (!z.uuid().safeParse(campaignId).success) notFound();

  const [campaign, options, savedAudiences, permissions] = await Promise.all([
    getCampaign(campaignId),
    getAudienceOptions(),
    listSavedAudiences(),
    loadUserPermissions(user.id),
  ]);
  if (!campaign) notFound();

  return (
    <>
      <BreadcrumbSegment id={campaign.id} label={campaign.name} />
      <CampaignEditor
        key={campaign.id}
        campaign={campaign}
        options={options}
        savedAudiences={savedAudiences.map(({ id, name, rules }) => ({
          id,
          name,
          rules,
        }))}
        permissions={{
          canWrite: anyPermissionMatches(permissions, 'campaign:write:all'),
          canPreviewRecipients: anyPermissionMatches(permissions, 'participant:read:all'),
          canSend:
            anyPermissionMatches(permissions, 'campaign:send:all') &&
            (campaign.type !== 'operational' || anyPermissionMatches(permissions, 'campaign:operational:all')),
        }}
      />
    </>
  );
}
