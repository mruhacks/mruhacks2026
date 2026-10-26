'use client';

/**
 * Our own shadcn controls for react-querybuilder (the core package, not the
 * shadcn registry copy), passed in through `controlElements`. The audience's
 * rule values are objects (`{ eventId, statuses }`), so the value editor is
 * one custom component per field rather than RQB's text inputs.
 */

import * as React from 'react';
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, FolderPlus, Plus, X } from 'lucide-react';
import type {
  ActionProps,
  ControlElementsProp,
  FullField,
  NotToggleProps,
  ShiftActionsProps,
  ValueEditorProps,
  ValueSelectorProps,
} from 'react-querybuilder';

import type * as Campaigns from '@/lib/campaigns';
import * as Participation from '@/lib/participation';
import { participationStatusesList } from '@/types/lookups';
import type { ParticipationStatus } from '@/types/lookups';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

/** Passed to every control through RQB's `context` prop. */
export type BuilderContext = { options: Campaigns.AudienceOptions };

function flatOptions(options: ValueSelectorProps['options']): { name: string; label: string }[] {
  return options.flatMap((option) =>
    'options' in option
      ? (option.options as { name: string; label: string }[])
      : [option as { name: string; label: string }],
  );
}

// ── Selectors (field, operator, combinator) ────────────────────────────────

function ValueSelector({ value, options, handleOnChange, disabled, title, className }: ValueSelectorProps) {
  return (
    <Select value={value} onValueChange={handleOnChange} disabled={disabled}>
      <SelectTrigger size='sm' aria-label={title} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {flatOptions(options).map((option) => (
          <SelectItem key={option.name} value={option.name}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NotToggle({ checked, handleOnChange, disabled, path, className }: NotToggleProps) {
  const id = `not-${path.join('-') || 'root'}`;
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Switch id={id} checked={!!checked} onCheckedChange={handleOnChange} disabled={disabled} />
      <Label htmlFor={id} className='text-xs font-normal'>
        Not
      </Label>
    </div>
  );
}

// ── Actions ────────────────────────────────────────────────────────────────

function makeAction(icon: React.ReactNode, label: string, variant: 'outline' | 'ghost' = 'outline', iconOnly = false) {
  function Action({ handleOnClick, disabled, title, className }: ActionProps) {
    return (
      <Button
        type='button'
        variant={variant}
        size={iconOnly ? 'icon' : 'sm'}
        className={cn(iconOnly && 'size-8', className)}
        onClick={(event) => handleOnClick(event)}
        disabled={disabled}
        title={title ?? label}
        aria-label={label}
      >
        {icon}
        {!iconOnly && label}
      </Button>
    );
  }
  Action.displayName = `Action(${label})`;
  return Action;
}

/**
 * Up/down instead of drag handles: keyboard-accessible, and it works on a
 * phone, where dragging nested rows fights the page's own scrolling.
 */
function ShiftActions({
  shiftUp,
  shiftDown,
  shiftUpDisabled,
  shiftDownDisabled,
  disabled,
  className,
}: ShiftActionsProps) {
  return (
    <div className={cn('flex', className)}>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-8'
        onClick={(event) => shiftUp(event)}
        disabled={disabled || shiftUpDisabled}
        aria-label='Move up'
        title='Move up'
      >
        <ArrowUp />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-8'
        onClick={(event) => shiftDown(event)}
        disabled={disabled || shiftDownDisabled}
        aria-label='Move down'
        title='Move down'
      >
        <ArrowDown />
      </Button>
    </div>
  );
}

// ── Value editors ──────────────────────────────────────────────────────────

function EventPicker({
  value,
  onChange,
  options,
  includeSubevents,
  disabled,
}: {
  value: string | undefined;
  onChange: (eventId: string) => void;
  options: Campaigns.AudienceOptions;
  includeSubevents: boolean;
  disabled?: boolean;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size='sm' aria-label='Event' className='max-w-full min-w-40' aria-invalid={!value}>
        <SelectValue placeholder='Choose an event' />
      </SelectTrigger>
      <SelectContent>
        {options.events.length === 0 && <div className='text-muted-foreground px-2 py-1.5 text-sm'>No events yet</div>}
        {options.events.map((event) =>
          includeSubevents && event.subevents.length > 0 ? (
            <SelectGroup key={event.id}>
              <SelectLabel>{event.name}</SelectLabel>
              <SelectItem value={event.id}>{event.name} (whole event)</SelectItem>
              {event.subevents.map((sub) => (
                <SelectItem key={sub.id} value={sub.id}>
                  {sub.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            <SelectItem key={event.id} value={event.id}>
              {event.name}
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}

function StatusMultiSelect({
  value,
  onChange,
  disabled,
}: {
  value: ParticipationStatus[];
  onChange: (statuses: ParticipationStatus[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(value);
  const label =
    value.length === 0
      ? 'Any status'
      : value.length <= 2
        ? value.map((status) => Participation.STATIC_STATUS_DISPLAY[status].title).join(', ')
        : `${value.length} statuses`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled}
          className='max-w-full justify-between font-normal'
          aria-label='Statuses'
        >
          <span className='truncate'>{label}</span>
          <ChevronsUpDown className='opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-56 p-0' align='start'>
        <Command>
          <CommandList>
            <CommandGroup>
              {participationStatusesList.map((status) => {
                const isSelected = selected.has(status);
                return (
                  <CommandItem
                    key={status}
                    onSelect={() => {
                      const next = new Set(selected);
                      if (isSelected) next.delete(status);
                      else next.add(status);
                      // Keep lifecycle order, not click order.
                      onChange(participationStatusesList.filter((s) => next.has(s)));
                    }}
                  >
                    <div
                      className={cn(
                        'border-primary flex size-4 items-center justify-center rounded-sm border',
                        isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className='size-3' />
                    </div>
                    {Participation.STATIC_STATUS_DISPLAY[status].title}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AudienceValueEditor({ field, value, handleOnChange, disabled, context }: ValueEditorProps) {
  const { options } = context as BuilderContext;
  const current = (value ?? {}) as Record<string, unknown>;
  const update = (patch: Record<string, unknown>) => handleOnChange({ ...current, ...patch });

  switch (field) {
    case 'participatedIn':
      return (
        <div className='flex flex-wrap items-center gap-2'>
          <EventPicker
            value={current.eventId as string | undefined}
            onChange={(eventId) => update({ eventId })}
            options={options}
            includeSubevents={false}
            disabled={disabled}
          />
          <span className='text-muted-foreground text-xs'>with</span>
          <StatusMultiSelect
            value={(current.statuses as ParticipationStatus[]) ?? []}
            onChange={(statuses) => update({ statuses })}
            disabled={disabled}
          />
        </div>
      );
    case 'checkedIn':
      return (
        <EventPicker
          value={current.eventId as string | undefined}
          onChange={(eventId) => update({ eventId })}
          options={options}
          includeSubevents
          disabled={disabled}
        />
      );
    case 'onTeam':
      return (
        <EventPicker
          value={current.eventId as string | undefined}
          onChange={(eventId) => update({ eventId })}
          options={options}
          includeSubevents={false}
          disabled={disabled}
        />
      );
    case 'marketingConsent':
      return (
        <Select
          value={current.optedIn === false ? 'out' : 'in'}
          onValueChange={(next) => update({ optedIn: next === 'in' })}
          disabled={disabled}
        >
          <SelectTrigger size='sm' aria-label='Consent'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='in'>Opted in</SelectItem>
            <SelectItem value='out'>Not opted in</SelectItem>
          </SelectContent>
        </Select>
      );
    case 'hasRole':
      return (
        <Select
          value={current.roleId ? String(current.roleId) : undefined}
          onValueChange={(next) => update({ roleId: Number(next) })}
          disabled={disabled}
        >
          <SelectTrigger size='sm' aria-label='Role' className='min-w-32' aria-invalid={!current.roleId}>
            <SelectValue placeholder='Choose a role' />
          </SelectTrigger>
          <SelectContent>
            {options.roles.map((role) => (
              <SelectItem key={role.id} value={String(role.id)}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    default:
      return null;
  }
}

// ── Exports ────────────────────────────────────────────────────────────────

export const AUDIENCE_FIELD_OPTIONS: FullField[] = [
  { name: 'participatedIn', label: 'Participant in', value: 'participatedIn' },
  { name: 'checkedIn', label: 'Checked in to', value: 'checkedIn' },
  { name: 'onTeam', label: 'On a team in', value: 'onTeam' },
  {
    name: 'marketingConsent',
    label: 'Marketing email',
    value: 'marketingConsent',
  },
  { name: 'hasRole', label: 'Has role', value: 'hasRole' },
];

export const AUDIENCE_CONTROL_ELEMENTS: ControlElementsProp<FullField, string> = {
  valueSelector: ValueSelector,
  valueEditor: AudienceValueEditor,
  notToggle: NotToggle,
  shiftActions: ShiftActions,
  addRuleAction: makeAction(<Plus />, 'Rule'),
  addGroupAction: makeAction(<FolderPlus />, 'Group'),
  removeRuleAction: makeAction(<X />, 'Remove rule', 'ghost', true),
  removeGroupAction: makeAction(<X />, 'Remove group', 'ghost', true),
};
