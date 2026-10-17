import { Utensils } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export function SubeventTypeBadge({ label }: { label: string | null }) {
  if (!label) return null;

  return (
    <Badge
      variant={label === 'meal' ? 'info' : 'outline'}
      className='capitalize'
    >
      {label === 'meal' && <Utensils aria-hidden />}
      {label}
    </Badge>
  );
}
