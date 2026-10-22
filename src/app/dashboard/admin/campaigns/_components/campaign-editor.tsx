'use client';

import * as React from 'react';
import Link from 'next/link';
import { BookmarkPlus, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { updateCampaignAudience } from '@/app/dashboard/admin/campaigns/actions';
import {
  detachCampaignAudience,
  linkCampaignAudience,
  saveCampaignAudienceAs,
} from '@/app/dashboard/admin/campaigns/audience-actions';
import type { AudienceOptions } from '@/lib/campaigns/audience-options';
import { emptyAudience, type AudienceRuleGroup } from '@/lib/campaigns/audience-rules';
import type { DraftEditorHandle } from '@/lib/campaigns/draft-saver';
import type { CampaignDetail } from '@/lib/campaigns/queries';
import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AudienceBuilder } from './audience-builder';
import { CampaignComposer } from './campaign-composer';
import { SendPanel } from './send-panel';

type CampaignEditorPermissions = {
  /** `campaign:write:all` */
  canWrite: boolean;
  /** `participant:read:all` — the recipient preview list. */
  canPreviewRecipients: boolean;
  /** `campaign:send:all`, plus `campaign:operational:all` for an operational campaign. */
  canSend: boolean;
};

type SavedAudienceOption = {
  id: string;
  name: string;
  rules: AudienceRuleGroup;
};

const INLINE = '__inline__';

type Props = {
  campaign: CampaignDetail;
  options: AudienceOptions;
  savedAudiences: SavedAudienceOption[];
  permissions: CampaignEditorPermissions;
};

export function CampaignEditor({ campaign, options, savedAudiences, permissions }: Props) {
  const editable = permissions.canWrite && campaign.status === 'draft';
  const [contentSaved, setContentSaved] = React.useState(true);
  const composer = React.useRef<DraftEditorHandle>(null);
  const audience = React.useRef<DraftEditorHandle>(null);
  const [preparing, setPreparing] = React.useState(false);
  const preparingRef = React.useRef(false);
  const [prepareError, setPrepareError] = React.useState<string | null>(null);

  function finishPreparing() {
    preparingRef.current = false;
    setPreparing(false);
  }

  async function prepareSend() {
    if (preparingRef.current) return false;
    preparingRef.current = true;
    setPreparing(true);
    setPrepareError(null);
    try {
      if (editable && (!(await composer.current!.flush()) || !(await audience.current!.flush()))) {
        setPrepareError('Save your edits successfully before sending or scheduling. Check the errors below.');
        finishPreparing();
        return false;
      }
      return true;
    } catch {
      setPrepareError('Could not save your edits. Please try again.');
      finishPreparing();
      return false;
    }
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <h1 className='truncate text-2xl font-semibold'>{campaign.name}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            <span className='capitalize'>{campaign.type}</span>
            {campaign.eventName && <> · {campaign.eventName}</>} · Last edited{' '}
            <LocalDateTime value={campaign.updatedAt} dateStyle='medium' timeStyle='short' />
            {campaign.updatedByName && <> by {campaign.updatedByName}</>}
          </p>
        </div>
        <Badge variant='outline' className='capitalize'>
          {campaign.status}
        </Badge>
      </div>

      <SendPanel
        campaignId={campaign.id}
        status={campaign.status}
        scheduledFor={campaign.scheduledFor}
        canSend={permissions.canSend}
        prepareSend={prepareSend}
        finishPreparing={finishPreparing}
        preparing={preparing}
        draftSaved={contentSaved}
      />

      {prepareError && <FieldError>{prepareError}</FieldError>}
      <div inert={preparing} className='flex flex-col gap-6'>
        <CampaignComposer
          campaign={campaign}
          editable={editable}
          canSendTest={permissions.canWrite}
          editorRef={composer}
          onSavedChange={setContentSaved}
        />

        <AudienceCard
          campaign={campaign}
          options={options}
          savedAudiences={savedAudiences}
          editable={editable}
          canPreview={permissions.canPreviewRecipients}
          editorRef={audience}
        />
      </div>
    </div>
  );
}

function AudienceCard({
  campaign,
  options,
  savedAudiences,
  editable,
  canPreview,
  editorRef,
}: {
  campaign: CampaignDetail;
  options: AudienceOptions;
  savedAudiences: SavedAudienceOption[];
  editable: boolean;
  canPreview: boolean;
  editorRef: React.Ref<DraftEditorHandle>;
}) {
  const linked = savedAudiences.find((a) => a.id === campaign.savedAudienceId);
  // A sent campaign shows the rules it was actually sent with, not whatever
  // its audience says now.
  const initial = campaign.audienceSnapshot ?? linked?.rules ?? campaign.audienceRules ?? emptyAudience();
  const [rules, setRules] = React.useState<AudienceRuleGroup>(initial);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const [saveAsName, setSaveAsName] = React.useState<string | null>(null);

  const handleChange = React.useCallback((next: AudienceRuleGroup) => {
    setRules(next);
    setDirty(true);
    setError(null);
  }, []);

  /** Runs an action, showing its error inline. Linking actions refresh the page's data themselves. */
  async function run(action: () => Promise<{ success: boolean; error?: string }>, success: string) {
    setIsBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? 'Something went wrong');
        return false;
      }
      setDirty(false);
      toast.success(success);
      return true;
    } catch {
      setError('Could not save the audience. Please try again.');
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  React.useImperativeHandle(editorRef, () => ({
    flush: async () => {
      if (isBusy) {
        setError('Wait for the audience save to finish, then try again.');
        return false;
      }
      return (
        !editable ||
        Boolean(linked) ||
        !dirty ||
        run(() => updateCampaignAudience(campaign.id, rules), 'Audience saved')
      );
    },
  }));

  const sourceValue = campaign.savedAudienceId ?? INLINE;
  const showSnapshot = Boolean(campaign.audienceSnapshot);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audience</CardTitle>
        <CardDescription>
          {showSnapshot
            ? 'The rules this campaign was sent with.'
            : 'Worked out again when the campaign is sent, so it always reflects who matches at that moment.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {!showSnapshot && (
          <div className='flex flex-wrap items-center gap-2'>
            <Select
              value={sourceValue}
              disabled={!editable || isBusy}
              onValueChange={(next) => {
                if (next === sourceValue) return;
                if (next === INLINE) {
                  void run(
                    () => detachCampaignAudience(campaign.id),
                    'Detached — the rules are now this campaign’s own',
                  );
                } else {
                  void run(() => linkCampaignAudience(campaign.id, next), 'Linked to saved audience');
                }
              }}
            >
              <SelectTrigger className='w-full sm:w-72' aria-label='Audience source'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INLINE}>This campaign’s own rules</SelectItem>
                {savedAudiences.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Saved audiences</SelectLabel>
                    {savedAudiences.map((audience) => (
                      <SelectItem key={audience.id} value={audience.id}>
                        {audience.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            {linked && (
              <>
                {editable && (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={isBusy}
                    onClick={() =>
                      void run(
                        () => detachCampaignAudience(campaign.id),
                        'Detached — the rules are now this campaign’s own',
                      )
                    }
                  >
                    <Unlink /> Detach
                  </Button>
                )}
                <Button asChild variant='ghost' size='sm'>
                  <Link href={`/dashboard/admin/campaigns/audiences/${linked.id}`}>Edit audience</Link>
                </Button>
              </>
            )}
          </div>
        )}
        {linked && !showSnapshot && (
          <p className='text-muted-foreground text-xs'>
            Linked: this campaign always uses the saved audience’s current rules. Detach to change them here only.
          </p>
        )}

        <AudienceBuilder
          // Reload the tree whenever its source changes.
          key={`${campaign.savedAudienceId ?? 'inline'}:${campaign.updatedAt.toString()}`}
          initialValue={initial}
          onChange={handleChange}
          options={options}
          type={campaign.type}
          eventId={campaign.eventId}
          canPreview={canPreview}
          disabled={!editable || Boolean(linked) || showSnapshot}
        />
        {error && <FieldError>{error}</FieldError>}

        {editable && !linked && !showSnapshot && (
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end'>
            {saveAsName === null ? (
              <Button variant='outline' disabled={isBusy} onClick={() => setSaveAsName('')}>
                <BookmarkPlus /> Save as audience
              </Button>
            ) : (
              <form
                className='flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end'
                onSubmit={async (event) => {
                  event.preventDefault();
                  const name = saveAsName;
                  const done = await run(async () => {
                    // Store any unsaved edits first, so the audience gets
                    // what's on screen.
                    if (dirty) {
                      const saved = await updateCampaignAudience(campaign.id, rules);
                      if (!saved.success) return saved;
                    }
                    return saveCampaignAudienceAs(campaign.id, name);
                  }, 'Saved as a reusable audience');
                  if (done) setSaveAsName(null);
                }}
              >
                <Input
                  autoFocus
                  aria-label='Audience name'
                  placeholder='Audience name'
                  value={saveAsName}
                  onChange={(e) => {
                    setSaveAsName(e.target.value);
                    setError(null);
                  }}
                  className='sm:max-w-64'
                />
                <div className='flex gap-2'>
                  <Button type='submit' variant='outline' disabled={isBusy}>
                    Save
                  </Button>
                  <Button type='button' variant='ghost' onClick={() => setSaveAsName(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            <Button
              onClick={() => void run(() => updateCampaignAudience(campaign.id, rules), 'Audience saved')}
              disabled={!dirty || isBusy}
            >
              {isBusy ? 'Saving…' : 'Save audience'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
