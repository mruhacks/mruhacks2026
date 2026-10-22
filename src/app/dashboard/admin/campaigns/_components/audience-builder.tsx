'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { QueryBuilder, type Classnames, type FullField, type RuleGroupType } from 'react-querybuilder';

import { countAudienceForBuilder, previewAudienceForBuilder } from '../actions';
import * as Campaigns from '@/lib/campaigns';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { AUDIENCE_CONTROL_ELEMENTS, AUDIENCE_FIELD_OPTIONS, type BuilderContext } from './query-builder-controls';

const COUNT_DEBOUNCE_MS = 400;

const OPERATORS = [
  { name: '=', value: '=', label: 'Is' },
  { name: '!=', value: '!=', label: 'Is not' },
];

const COMBINATORS = [
  { name: 'and', value: 'and', label: 'All of' },
  { name: 'or', value: 'or', label: 'Any of' },
];

function defaultValueFor(field: string): Record<string, unknown> {
  switch (field) {
    case 'participatedIn':
      return { eventId: '', statuses: [] };
    case 'marketingConsent':
      return { optedIn: true };
    case 'hasRole':
      return { roleId: 0 };
    default:
      return { eventId: '' };
  }
}

/** Tailwind in place of RQB's own stylesheet, so it follows our theme (light and dark). */
const CLASSNAMES: Partial<Classnames> = {
  queryBuilder: 'text-sm',
  ruleGroup: 'bg-muted/40 flex flex-col gap-2 rounded-lg border p-2 sm:p-3 [&_.ruleGroup]:bg-background',
  header: 'flex flex-wrap items-center gap-2',
  body: 'flex flex-col gap-2 empty:hidden',
  rule: 'bg-background flex flex-wrap items-center gap-2 rounded-md border p-2',
  // Reads "Is not · Participant in · <event>" rather than putting the verb in the middle.
  operators: '-order-1',
  shiftActions: 'order-first',
  removeRule: 'ml-auto',
  removeGroup: 'ml-auto',
};

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type AudienceBuilderProps = {
  /** Read once on mount; remount (`key`) to load a different tree. */
  initialValue: Campaigns.AudienceRuleGroup;
  onChange?: (rules: Campaigns.AudienceRuleGroup) => void;
  options: Campaigns.AudienceOptions;
  /** The campaign the audience is evaluated for — its forced conditions apply to the count. */
  type: Campaigns.CampaignType;
  eventId: string | null;
  /** `participant:read:all`: shows the recipient preview. */
  canPreview: boolean;
  disabled?: boolean;
};

export function AudienceBuilder({
  initialValue,
  onChange,
  options,
  type,
  eventId,
  canPreview,
  disabled,
}: AudienceBuilderProps) {
  const [tree, setTree] = React.useState<Campaigns.AudienceRuleGroup>(initialValue);
  const context = React.useMemo<BuilderContext>(() => ({ options }), [options]);

  const handleQueryChange = React.useCallback(
    (query: RuleGroupType) => {
      const next = query as unknown as Campaigns.AudienceRuleGroup;
      setTree(next);
      onChange?.(next);
    },
    [onChange],
  );

  return (
    <div className='flex flex-col gap-3'>
      <QueryBuilder
        fields={AUDIENCE_FIELD_OPTIONS as FullField[]}
        defaultQuery={initialValue as unknown as RuleGroupType}
        onQueryChange={handleQueryChange}
        controlElements={AUDIENCE_CONTROL_ELEMENTS}
        controlClassnames={CLASSNAMES}
        getOperators={() => OPERATORS}
        combinators={COMBINATORS}
        getDefaultField='participatedIn'
        getDefaultValue={(rule) => defaultValueFor(rule.field)}
        resetOnFieldChange
        showNotToggle
        showShiftActions
        addRuleToNewGroups
        context={context}
        disabled={disabled}
        translations={{
          addRule: { label: 'Rule', title: 'Add rule' },
          addGroup: { label: 'Group', title: 'Add group' },
        }}
      />
      <AudienceSummary tree={tree} type={type} eventId={eventId} canPreview={canPreview} />
    </div>
  );
}

function AudienceSummary({
  tree,
  type,
  eventId,
  canPreview,
}: {
  tree: Campaigns.AudienceRuleGroup;
  type: Campaigns.CampaignType;
  eventId: string | null;
  canPreview: boolean;
}) {
  const debouncedTree = useDebounced(tree, COUNT_DEBOUNCE_MS);
  const parsed = React.useMemo(() => Campaigns.audienceRulesSchema.safeParse(debouncedTree), [debouncedTree]);
  const rules = parsed.success ? parsed.data : null;
  const input = React.useMemo(() => (rules ? { context: { type, eventId }, rules } : null), [rules, type, eventId]);

  const count = useQuery({
    queryKey: ['campaign-audience-count', input],
    queryFn: async () => {
      const result = await countAudienceForBuilder(input!);
      if (!result.success) throw new Error(result.error);
      return result.data ?? 0;
    },
    enabled: input !== null,
    placeholderData: (previous) => previous,
  });

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const preview = useQuery({
    queryKey: ['campaign-audience-preview', input],
    queryFn: async () => {
      const result = await previewAudienceForBuilder(input!);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    enabled: canPreview && previewOpen && input !== null,
  });

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='flex items-center gap-2 text-sm' aria-live='polite'>
          <Users className='text-muted-foreground size-4' />
          {!rules ? (
            <span className='text-muted-foreground'>Finish every rule to see who this reaches.</span>
          ) : count.isPending ? (
            <Spinner />
          ) : count.isError ? (
            <span className='text-destructive'>{count.error.message}</span>
          ) : (
            <span>
              <strong>{count.data.toLocaleString()}</strong> {count.data === 1 ? 'recipient' : 'recipients'}
              {count.isFetching && <Spinner className='ml-2 inline size-3' />}
            </span>
          )}
        </p>
        {canPreview && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={!rules}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            {previewOpen ? 'Hide recipients' : 'Preview recipients'}
          </Button>
        )}
      </div>
      <p className='text-muted-foreground text-xs'>
        {type === 'marketing'
          ? 'Marketing email only ever reaches people who opted in, whatever the rules say.'
          : 'Operational email only ever reaches participants of this campaign’s event.'}{' '}
        Unverified email addresses are always left out.
      </p>
      {canPreview && previewOpen && rules && (
        <div className='rounded-md border'>
          {preview.isPending ? (
            <div className='p-3'>
              <Spinner />
            </div>
          ) : preview.isError ? (
            <FieldError className='p-3'>{preview.error.message}</FieldError>
          ) : preview.data.length === 0 ? (
            <p className='text-muted-foreground p-3 text-sm'>Nobody yet.</p>
          ) : (
            <ul className='divide-y text-sm'>
              {preview.data.map((member) => (
                <li key={member.id} className='flex flex-col px-3 py-2 sm:flex-row sm:justify-between sm:gap-4'>
                  <span className='truncate font-medium'>{member.name}</span>
                  <span className='text-muted-foreground truncate'>{member.email}</span>
                </li>
              ))}
            </ul>
          )}
          {preview.data && count.data !== undefined && count.data > preview.data.length && (
            <p className='text-muted-foreground border-t px-3 py-2 text-xs'>
              Showing {preview.data.length} of {count.data.toLocaleString()}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
