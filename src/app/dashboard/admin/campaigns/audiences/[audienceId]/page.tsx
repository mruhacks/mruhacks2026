import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';

import * as Campaigns from '@/lib/campaigns/server';
import * as Rbac from '@/lib/rbac/server';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { SavedAudienceEditor } from '@/app/dashboard/admin/campaigns/_components/saved-audience-editor';

type Props = { params: Promise<{ audienceId: string }> };

export default function SavedAudiencePage({ params }: Props) {
  return (
    <div className='space-y-6'>
      <Link
        href='/dashboard/admin/campaigns/audiences'
        className='text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline'
      >
        <ArrowLeft className='size-4' /> Saved audiences
      </Link>
      <React.Suspense fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}>
        <AudienceContent paramsPromise={params} />
      </React.Suspense>
    </div>
  );
}

async function AudienceContent({ paramsPromise }: { paramsPromise: Promise<{ audienceId: string }> }) {
  const { audienceId } = await paramsPromise;
  const user = await Rbac.requireAuthWithPermission('campaign:read:all');
  if (!z.uuid().safeParse(audienceId).success) notFound();

  const [audience, options, permissions] = await Promise.all([
    Campaigns.getSavedAudience(audienceId),
    Campaigns.getAudienceOptions(),
    Rbac.loadUserPermissions(user.id),
  ]);
  if (!audience) notFound();

  return (
    <>
      <BreadcrumbSegment id={audience.id} label={audience.name} />
      <SavedAudienceEditor
        key={`${audience.id}:${audience.updatedAt.toISOString()}`}
        audience={audience}
        options={options}
        canWrite={Rbac.anyPermissionMatches(permissions, 'campaign:write:all')}
        canPreview={Rbac.anyPermissionMatches(permissions, 'participant:read:all')}
      />
    </>
  );
}
