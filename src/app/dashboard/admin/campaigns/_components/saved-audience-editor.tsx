'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteSavedAudience,
  updateSavedAudience,
} from '@/app/dashboard/admin/campaigns/audience-actions';
import type { AudienceOptions } from '@/lib/campaigns/audience-options';
import type { AudienceRuleGroup } from '@/lib/campaigns/audience-rules';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AudienceBuilder } from './audience-builder';

type Props = {
  audience: {
    id: string;
    name: string;
    rules: AudienceRuleGroup;
    usedBy: number;
    scheduled: number;
  };
  options: AudienceOptions;
  canWrite: boolean;
  canPreview: boolean;
};

export function SavedAudienceEditor({
  audience,
  options,
  canWrite,
  canPreview,
}: Props) {
  const router = useRouter();
  const [name, setName] = React.useState(audience.name);
  const [rules, setRules] = React.useState(audience.rules);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const handleChange = React.useCallback((next: AudienceRuleGroup) => {
    setRules(next);
    setError(null);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setIsBusy(true);
    const result = await updateSavedAudience(audience.id, { name, rules });
    setIsBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    toast.success('Audience saved');
  }

  async function remove() {
    setIsBusy(true);
    setDeleteError(null);
    const result = await deleteSavedAudience(audience.id);
    setIsBusy(false);
    if (!result.success) {
      setDeleteError(result.error);
      return;
    }
    toast.success('Audience deleted');
    router.push('/dashboard/admin/campaigns/audiences');
  }

  return (
    <form onSubmit={save} className='space-y-6'>
      <Field className='max-w-md'>
        <FieldLabel htmlFor='audience-name'>Name</FieldLabel>
        <Input
          id='audience-name'
          value={name}
          disabled={!canWrite}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </Field>

      {audience.usedBy > 0 && (
        <div className='flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0' />
          <p>
            Used by{' '}
            <strong>
              {audience.usedBy}{' '}
              {audience.usedBy === 1 ? 'campaign' : 'campaigns'}
            </strong>
            {audience.scheduled > 0 && <> ({audience.scheduled} scheduled)</>}.
            Changes apply to every linked campaign that hasn&apos;t been sent
            yet.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <CardDescription>
            The count shows who a marketing campaign would reach. Operational
            campaigns are also limited to their event&apos;s participants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AudienceBuilder
            initialValue={audience.rules}
            onChange={handleChange}
            options={options}
            type='marketing'
            eventId={null}
            canPreview={canPreview}
            disabled={!canWrite}
          />
        </CardContent>
      </Card>

      {error && <FieldError>{error}</FieldError>}

      {canWrite && (
        <div className='flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-1'>
            <Button
              type='button'
              variant='outline'
              className='text-destructive'
              disabled={isBusy}
              onClick={remove}
            >
              <Trash2 /> Delete audience
            </Button>
            {deleteError && <FieldError>{deleteError}</FieldError>}
          </div>
          <Button type='submit' disabled={isBusy}>
            {isBusy ? 'Saving…' : 'Save audience'}
          </Button>
        </div>
      )}
    </form>
  );
}
