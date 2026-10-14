'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { updateCampaignAudience } from '@/app/dashboard/admin/campaigns/actions';
import type { AudienceOptions } from '@/lib/campaigns/audience-options';
import {
  emptyAudience,
  type AudienceRuleGroup,
} from '@/lib/campaigns/audience-rules';
import type { CampaignDetail } from '@/lib/campaigns/queries';
import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { AudienceBuilder } from './audience-builder';

export type CampaignEditorPermissions = {
  /** `campaign:write:all` */
  canWrite: boolean;
  /** `participant:read:all` — the recipient preview list. */
  canPreviewRecipients: boolean;
};

type Props = {
  campaign: CampaignDetail;
  options: AudienceOptions;
  permissions: CampaignEditorPermissions;
};

export function CampaignEditor({ campaign, options, permissions }: Props) {
  const editable = permissions.canWrite && campaign.status === 'draft';

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <h1 className='truncate text-2xl font-semibold'>{campaign.name}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            <span className='capitalize'>{campaign.type}</span>
            {campaign.eventName && <> · {campaign.eventName}</>} · Last edited{' '}
            <LocalDateTime
              value={campaign.updatedAt}
              dateStyle='medium'
              timeStyle='short'
            />
            {campaign.updatedByName && <> by {campaign.updatedByName}</>}
          </p>
        </div>
        <Badge variant='outline' className='capitalize'>
          {campaign.status}
        </Badge>
      </div>

      <AudienceCard
        campaign={campaign}
        options={options}
        editable={editable}
        canPreview={permissions.canPreviewRecipients}
      />
    </div>
  );
}

function AudienceCard({
  campaign,
  options,
  editable,
  canPreview,
}: {
  campaign: CampaignDetail;
  options: AudienceOptions;
  editable: boolean;
  canPreview: boolean;
}) {
  const initial =
    campaign.audienceSnapshot ?? campaign.audienceRules ?? emptyAudience();
  const [rules, setRules] = React.useState<AudienceRuleGroup>(initial);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleChange = React.useCallback((next: AudienceRuleGroup) => {
    setRules(next);
    setDirty(true);
    setError(null);
  }, []);

  async function save() {
    setIsSaving(true);
    const result = await updateCampaignAudience(campaign.id, rules);
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setDirty(false);
    toast.success('Audience saved');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audience</CardTitle>
        <CardDescription>
          Worked out again when the campaign is sent, so it always reflects who
          matches at that moment.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <AudienceBuilder
          initialValue={initial}
          onChange={handleChange}
          options={options}
          type={campaign.type}
          eventId={campaign.eventId}
          canPreview={canPreview}
          disabled={!editable}
        />
        {error && <FieldError>{error}</FieldError>}
        {editable && (
          <div className='flex justify-end'>
            <Button onClick={save} disabled={!dirty || isSaving}>
              {isSaving ? 'Saving…' : 'Save audience'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
