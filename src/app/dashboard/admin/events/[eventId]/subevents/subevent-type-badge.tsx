import { Utensils } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { MEAL_EVENT_TYPE, type EventType } from '@/types/lookups';

export function SubeventTypeBadge({ label }: { label: EventType | null }) {
  if (!label) return null;

  return (
    <Badge variant={label === MEAL_EVENT_TYPE ? 'info' : 'outline'} className='capitalize'>
      {label === MEAL_EVENT_TYPE && <Utensils aria-hidden />}
      {label}
    </Badge>
  );
}
