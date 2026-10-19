'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EventTypeOption } from '@/lib/event-types';

const NONE = 'none';

export function EventTypeSelect({
  id,
  value,
  options,
  invalid,
  onChange,
}: {
  id: string;
  value: number | null;
  options: EventTypeOption[];
  invalid?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <Select
      value={value ? String(value) : NONE}
      onValueChange={(next) => onChange(next === NONE ? null : Number(next))}
    >
      <SelectTrigger id={id} className='w-full' aria-invalid={invalid}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {options.map((type) => (
          <SelectItem
            key={type.id}
            value={String(type.id)}
            className='capitalize'
          >
            {type.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
